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

const updateList = (user: TestUser, body: object) =>
  request(app).post("/api/updateList").set(as(user)).send(body);

describe("updateList", () => {
  it("renames the list and keeps its cards", async () => {
    const res = await updateList(owner, { listId: board.listId, name: "  In Progress  " });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ listId: board.listId, listName: "In Progress" });

    const tasks = await request(app)
      .post("/api/getTasks")
      .set(as(owner))
      .send({ boardId: board.boardId });
    const list = tasks.body.find((l: any) => l.listId === board.listId);
    expect(list.listName).toBe("In Progress");
    expect(list.cards.map((c: any) => c.card_title)).toEqual(["Secret task"]);
  });

  it("lets a board member rename a list", async () => {
    const member = await createUser("member");
    await pool.query(
      "INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'member')",
      [board.boardId, member.id]
    );

    const res = await updateList(member, { listId: board.listId, name: "Member rename" });
    expect(res.status).toBe(200);
  });

  it.each([
    ["missing name", { listId: 1 }],
    ["blank name", { listId: 1, name: "   " }],
    ["non-string name", { listId: 1, name: 123 }],
    ["name over 255 characters", { listId: 1, name: "a".repeat(256) }],
    ["missing listId", { name: "Backlog" }],
    ["non-numeric listId", { listId: "abc", name: "Backlog" }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await updateList(owner, body);
    expect(res.status).toBe(400);
  });

  it("returns 404 for a list that doesn't exist", async () => {
    const res = await updateList(owner, { listId: 999999, name: "Ghost" });
    expect(res.status).toBe(404);
  });

  it("cannot rename a list on another user's board", async () => {
    const res = await updateList(stranger, { listId: board.listId, name: "Hijacked" });
    expect(res.status).toBe(404);

    const { rows } = await pool.query("SELECT name FROM lists WHERE id = $1", [board.listId]);
    expect(rows[0].name).not.toBe("Hijacked");
  });

  it("requires a token", async () => {
    const res = await request(app)
      .post("/api/updateList")
      .send({ listId: board.listId, name: "Anon" });
    expect(res.status).toBe(401);
  });
});
