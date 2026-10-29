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
let board: Awaited<ReturnType<typeof createBoardWithCard>>;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("owner");
  board = await createBoardWithCard(owner);
});
afterAll(() => pool.end());

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

describe("getTaskDetails input", () => {
  it.each([
    ["missing cardId", {}],
    ["non-numeric cardId", { cardId: "abc" }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await request(app)
      .post("/api/getTaskDetails")
      .set(as(owner))
      .send(body);
    expect(res.status).toBe(400);
  });
});

describe("addTask", () => {
  it("returns 400 for a non-numeric listId", async () => {
    const res = await request(app)
      .post("/api/addTask")
      .set(as(owner))
      .send({ listId: "abc", title: "Bad list" });
    expect(res.status).toBe(400);
  });

  it("creates the card and assigns it to the caller", async () => {
    const res = await request(app)
      .post("/api/addTask")
      .set(as(owner))
      .send({ listId: board.listId, title: "Assigned task" });
    expect(res.status).toBe(201);

    const { rows } = await pool.query(
      "SELECT user_id FROM card_assignees WHERE card_id = $1",
      [res.body.id]
    );
    expect(rows).toEqual([{ user_id: owner.id }]);
  });
});
