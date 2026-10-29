import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  app,
  createBoardWithCard,
  createUser,
  pool,
  resetDatabase,
  TestUser,
} from "./helpers";

let owner: TestUser;
let stranger: TestUser;
let board: Awaited<ReturnType<typeof createBoardWithCard>>;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("owner");
  stranger = await createUser("stranger");
  board = await createBoardWithCard(owner);
});
afterAll(() => pool.end());

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

const addList = (user: TestUser, body: object) =>
  request(app).post("/api/addList").set(as(user)).send(body);

const getTasks = (user: TestUser, boardId: number) =>
  request(app).post("/api/getTasks").set(as(user)).send({ boardId });

describe("addList", () => {
  it("creates a list in the same shape getTasks returns", async () => {
    const res = await addList(owner, { boardId: board.boardId, name: "Doing" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      listId: expect.any(Number),
      listName: "Doing",
      cards: [],
    });

    const tasks = await getTasks(owner, board.boardId);
    expect(tasks.body).toContainEqual(res.body);
  });

  it("puts each new list after the existing ones", async () => {
    await addList(owner, { boardId: board.boardId, name: "Done" });

    const tasks = await getTasks(owner, board.boardId);
    expect(tasks.body.map((l: any) => l.listName)).toEqual([
      "To Do",
      "Doing",
      "Done",
    ]);
  });

  it.each([
    ["missing name", { boardId: 1 }],
    ["blank name", { boardId: 1, name: "   " }],
    ["missing boardId", { name: "Backlog" }],
    ["non-numeric boardId", { boardId: "abc", name: "Backlog" }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await addList(owner, body);
    expect(res.status).toBe(400);
  });

  it("cannot add a list to another user's board", async () => {
    const res = await addList(stranger, { boardId: board.boardId, name: "Injected" });
    expect(res.status).toBe(404);

    const { rows } = await pool.query("SELECT 1 FROM lists WHERE name = 'Injected'");
    expect(rows).toHaveLength(0);
  });

  it("requires a token", async () => {
    const res = await request(app)
      .post("/api/addList")
      .send({ boardId: board.boardId, name: "Anon" });
    expect(res.status).toBe(401);
  });
});
