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

// Alice owns a board; Bob is a different logged-in user who should never
// be able to see or change it, whatever IDs he puts in the request body.
let alice: TestUser;
let bob: TestUser;
let aliceBoard: Awaited<ReturnType<typeof createBoardWithCard>>;

beforeAll(async () => {
  await resetDatabase();
  alice = await createUser("alice");
  bob = await createUser("bob");
  aliceBoard = await createBoardWithCard(alice);
});
afterAll(() => pool.end());

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

describe("authorization", () => {
  it("owner can see their own boards", async () => {
    const res = await request(app)
      .post("/api/getBoards")
      .set(as(alice))
      .send({ userId: alice.id });
    expect(res.status).toBe(200);
    expect(res.body.map((b: any) => b.id)).toContain(aliceBoard.boardId);
  });

  it("getBoards does not return another user's boards", async () => {
    const res = await request(app)
      .post("/api/getBoards")
      .set(as(bob))
      .send({ userId: alice.id });
    const ids = res.status === 200 ? res.body.map((b: any) => b.id) : [];
    expect(ids).not.toContain(aliceBoard.boardId);
  });

  it("getTasks does not return another user's cards", async () => {
    const res = await request(app)
      .post("/api/getTasks")
      .set(as(bob))
      .send({ userId: alice.id, boardId: aliceBoard.boardId });
    expect(JSON.stringify(res.body)).not.toContain("Secret task");
  });

  it("getTaskDetails does not return another user's card", async () => {
    const res = await request(app)
      .post("/api/getTaskDetails")
      .set(as(bob))
      .send({ cardId: aliceBoard.cardId });
    expect([403, 404]).toContain(res.status);
  });

  it("addTask cannot add a card to another user's list", async () => {
    const res = await request(app)
      .post("/api/addTask")
      .set(as(bob))
      .send({ title: "Injected", listId: aliceBoard.listId, userId: alice.id });
    expect([403, 404]).toContain(res.status);
  });

  it("createBoards cannot create a board owned by someone else", async () => {
    await request(app)
      .post("/api/createBoards")
      .set(as(bob))
      .send({ name: "Not yours", ownerId: alice.id });
    const { rows } = await pool.query(
      "SELECT 1 FROM boards WHERE name = 'Not yours' AND owner_id = $1",
      [alice.id]
    );
    expect(rows).toHaveLength(0);
  });
});
