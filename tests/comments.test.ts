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
let member: TestUser;
let stranger: TestUser;
let board: Awaited<ReturnType<typeof createBoardWithCard>>;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("owner");
  member = await createUser("member");
  stranger = await createUser("stranger");
  board = await createBoardWithCard(owner);
  await pool.query(
    "INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'member')",
    [board.boardId, member.id]
  );
});
afterAll(() => pool.end());

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

const addComment = (user: TestUser, body: object) =>
  request(app).post("/api/addComment").set(as(user)).send(body);

const getComments = (user: TestUser, cardId: unknown) =>
  request(app).post("/api/getComments").set(as(user)).send({ cardId });

const countComments = async () =>
  (await pool.query("SELECT COUNT(*)::int AS n FROM card_comments")).rows[0].n;

describe("getComments", () => {
  it("returns an empty array for a card with no comments", async () => {
    const res = await getComments(owner, board.cardId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("addComment", () => {
  it("saves the comment with the caller as its author", async () => {
    const res = await addComment(owner, { cardId: board.cardId, body: "  First!  " });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      comment_id: expect.any(Number),
      body: "First!",
      created_at: expect.any(String),
      updated_at: null,
      user_id: owner.id,
      author_name: "owner",
    });
  });

  it("ignores a userId in the body", async () => {
    const res = await addComment(member, {
      cardId: board.cardId,
      body: "From member",
      userId: owner.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.user_id).toBe(member.id);
  });

  it.each([
    ["missing body", { cardId: 1 }],
    ["blank body", { cardId: 1, body: "   " }],
    ["non-string body", { cardId: 1, body: 123 }],
    ["body over 5000 characters", { cardId: 1, body: "a".repeat(5001) }],
    ["missing cardId", { body: "Hi" }],
    ["non-numeric cardId", { cardId: "abc", body: "Hi" }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await addComment(owner, body);
    expect(res.status).toBe(400);
  });

  it("returns 404 for a card that doesn't exist", async () => {
    const res = await addComment(owner, { cardId: 999999, body: "Ghost" });
    expect(res.status).toBe(404);
  });

  it("cannot comment on a card on another user's board", async () => {
    const before = await countComments();
    const res = await addComment(stranger, { cardId: board.cardId, body: "Injected" });
    expect(res.status).toBe(404);
    expect(await countComments()).toBe(before);
  });

  it("requires a token", async () => {
    const res = await request(app)
      .post("/api/addComment")
      .send({ cardId: board.cardId, body: "Anon" });
    expect(res.status).toBe(401);
  });
});

describe("getComments after commenting", () => {
  it("returns every comment on the card, newest first, with author names", async () => {
    const res = await getComments(member, board.cardId);
    expect(res.status).toBe(200);
    expect(res.body.map((c: { body: string }) => c.body)).toEqual(["From member", "First!"]);
    expect(res.body[1]).toMatchObject({ user_id: owner.id, author_name: "owner" });
  });

  it("only returns comments for the requested card", async () => {
    const other = await createBoardWithCard(owner);
    await addComment(owner, { cardId: other.cardId, body: "Elsewhere" });

    const res = await getComments(owner, board.cardId);
    expect(res.body.map((c: { body: string }) => c.body)).not.toContain("Elsewhere");
  });

  it("returns 400 for a bad cardId", async () => {
    const res = await getComments(owner, "abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 for a card that doesn't exist", async () => {
    const res = await getComments(owner, 999999);
    expect(res.status).toBe(404);
  });

  it("cannot read comments on another user's board", async () => {
    const res = await getComments(stranger, board.cardId);
    expect(res.status).toBe(404);
  });

  it("requires a token", async () => {
    const res = await request(app).post("/api/getComments").send({ cardId: board.cardId });
    expect(res.status).toBe(401);
  });
});
