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

  it("owner can still read their own cards and card details", async () => {
    const tasks = await request(app)
      .post("/api/getTasks")
      .set(as(alice))
      .send({ boardId: aliceBoard.boardId });
    expect(tasks.status).toBe(200);
    expect(JSON.stringify(tasks.body)).toContain("Secret task");

    const details = await request(app)
      .post("/api/getTaskDetails")
      .set(as(alice))
      .send({ cardId: aliceBoard.cardId });
    expect(details.status).toBe(200);
    expect(details.body.card_title).toBe("Secret task");
  });

  it("owner can add a card to their own list", async () => {
    const res = await request(app)
      .post("/api/addTask")
      .set(as(alice))
      .send({ title: "New task", listId: aliceBoard.listId });
    expect(res.status).toBe(201);
  });

  it("a board member can see a board they don't own", async () => {
    const carol = await createUser("carol");
    const carolBoard = await createBoardWithCard(carol);
    await pool.query(
      "INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'member')",
      [carolBoard.boardId, bob.id]
    );

    const boards = await request(app).post("/api/getBoards").set(as(bob)).send({});
    expect(boards.body.map((b: any) => b.id)).toContain(carolBoard.boardId);

    const tasks = await request(app)
      .post("/api/getTasks")
      .set(as(bob))
      .send({ boardId: carolBoard.boardId });
    expect(tasks.status).toBe(200);
  });
});
