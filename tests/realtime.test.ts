import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, Server as HttpServer } from "http";
import { AddressInfo } from "net";
import request from "supertest";
import { io as connectSocket, Socket } from "socket.io-client";
import { app, createUser, pool, resetDatabase, TestUser } from "./helpers";
import { attachRealtime, closeRealtime } from "../src/realtime/realtime";

let server: HttpServer;
let url: string;
let owner: TestUser;
let member: TestUser;
let stranger: TestUser;
let boardId: number;
let todo: number;
let doing: number;
let cardId: number;
const sockets: Socket[] = [];

// A real server on a free port, so sockets and HTTP requests reach the same process
beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("owner");
  member = await createUser("member");
  stranger = await createUser("stranger");
  server = createServer(app);
  attachRealtime(server);
  await new Promise<void>(resolve => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await closeRealtime();
  await pool.end();
});

beforeEach(async () => {
  boardId = (await pool.query("INSERT INTO boards (name, owner_id) VALUES ('Live board', $1) RETURNING id", [owner.id])).rows[0].id;
  await pool.query("INSERT INTO board_members (board_id, user_id) VALUES ($1, $2)", [boardId, member.id]);
  todo = (await pool.query("INSERT INTO lists (board_id, name, position) VALUES ($1, 'To Do', 0) RETURNING id", [boardId])).rows[0].id;
  doing = (await pool.query("INSERT INTO lists (board_id, name, position) VALUES ($1, 'Doing', 1) RETURNING id", [boardId])).rows[0].id;
  cardId = (await pool.query("INSERT INTO cards (list_id, title, position) VALUES ($1, 'a0', 0) RETURNING id", [todo])).rows[0].id;
});
afterEach(() => {
  sockets.splice(0).forEach(s => s.close());
});

const connect = (auth: object) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = connectSocket(url, { auth, transports: ["websocket"], reconnection: false, forceNew: true });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });

// Connected and in the board's room, with every board:changed it hears collected in `heard`
const watch = async (user: TestUser, board = boardId) => {
  const socket = await connect({ token: user.token });
  const heard: unknown[] = [];
  socket.on("board:changed", event => heard.push(event));
  const joined = await socket.emitWithAck("joinBoard", board);
  return { socket, heard, joined };
};

const nextChange = (socket: Socket) => new Promise(resolve => socket.once("board:changed", resolve));
// for "nothing arrives": events are delivered within milliseconds locally
const settle = () => new Promise(resolve => setTimeout(resolve, 150));

const post = (user: TestUser, path: string, body: object, socketId?: string) => {
  const req = request(server).post(path).set("Authorization", `Bearer ${user.token}`);
  return (socketId ? req.set("X-Socket-Id", socketId) : req).send(body);
};

describe("realtime: connecting", () => {
  it("rejects a socket without a token", async () => {
    await expect(connect({})).rejects.toThrow("Unauthorized");
  });

  it("rejects a socket with a bad token", async () => {
    await expect(connect({ token: "not-a-jwt" })).rejects.toThrow("Unauthorized");
  });

  it("lets the owner and a member join the board", async () => {
    expect((await watch(owner)).joined).toEqual({ ok: true });
    expect((await watch(member)).joined).toEqual({ ok: true });
  });

  it.each([["someone else's board", () => boardId], ["a bad id", () => "abc"], ["a missing board", () => 999999]])(
    "refuses to join %s",
    async (_name, board) => {
      expect((await watch(stranger, board() as number)).joined).toEqual({ ok: false });
    }
  );
});

describe("realtime: board:changed", () => {
  it("tells a member when the owner moves a card", async () => {
    const { socket } = await watch(member);
    const change = nextChange(socket);

    await post(owner, "/api/moveCard", { cardId, listId: doing, position: 0 }).expect(200);

    expect(await change).toEqual({ boardId });
  });

  it.each([
    ["addTask", () => ({ listId: todo, title: "new card" }), 201],
    ["addList", () => ({ boardId, name: "Done" }), 201],
    ["updateList", () => ({ listId: todo, name: "Backlog" }), 200],
    ["updateCard", () => ({ cardId, title: "renamed" }), 200],
  ])("tells a member after %s", async (route, body, status) => {
    const { socket } = await watch(member);
    const change = nextChange(socket);

    await post(owner, `/api/${route}`, body()).expect(status);

    expect(await change).toEqual({ boardId });
  });

  it("skips the tab that made the change but still tells the others", async () => {
    const mover = await watch(owner);
    const otherTab = await watch(owner);
    const change = nextChange(otherTab.socket);

    await post(owner, "/api/moveCard", { cardId, listId: doing, position: 0 }, mover.socket.id).expect(200);

    expect(await change).toEqual({ boardId });
    await settle();
    expect(mover.heard).toEqual([]);
  });

  it("tells nobody about a write that failed", async () => {
    const { heard } = await watch(member);

    await post(stranger, "/api/moveCard", { cardId, listId: doing, position: 0 }).expect(404);
    await post(owner, "/api/addTask", { listId: todo, title: "" }).expect(400);

    await settle();
    expect(heard).toEqual([]);
  });

  it("tells nobody outside the board's room", async () => {
    const outsider = await watch(stranger); // refused, so not in the room
    const otherBoard = (await pool.query("INSERT INTO boards (name, owner_id) VALUES ('Other', $1) RETURNING id", [member.id])).rows[0].id;
    const elsewhere = await watch(member, otherBoard);

    await post(owner, "/api/moveCard", { cardId, listId: doing, position: 0 }).expect(200);

    await settle();
    expect(outsider.heard).toEqual([]);
    expect(elsewhere.heard).toEqual([]);
  });

  it("stops telling a socket after it leaves the board", async () => {
    const { socket, heard } = await watch(member);
    socket.emit("leaveBoard", boardId);
    await settle();

    await post(owner, "/api/moveCard", { cardId, listId: doing, position: 0 }).expect(200);

    await settle();
    expect(heard).toEqual([]);
  });
});
