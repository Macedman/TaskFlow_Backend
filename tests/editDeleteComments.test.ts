import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

const post = (path: string, user: TestUser, body: object) =>
  request(app).post(path).set(as(user)).send(body);

const addComment = async (user: TestUser, body: string): Promise<number> =>
  (await post("/api/addComment", user, { cardId: board.cardId, body })).body.comment_id;

const commentRow = async (id: number) =>
  (await pool.query("SELECT body, updated_at FROM card_comments WHERE id = $1", [id])).rows[0];

describe("comment responses", () => {
  it("a new comment has no updated_at", async () => {
    const res = await post("/api/addComment", owner, { cardId: board.cardId, body: "Fresh" });
    expect(res.body.updated_at).toBeNull();
  });
});

describe("updateComment", () => {
  let memberComment: number;

  beforeEach(async () => {
    memberComment = await addComment(member, "Original");
  });

  it("lets the author change the body and marks it edited", async () => {
    const res = await post("/api/updateComment", member, { commentId: memberComment, body: "  Changed  " });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      comment_id: memberComment,
      body: "Changed",
      created_at: expect.any(String),
      updated_at: expect.any(String),
      user_id: member.id,
      author_name: "member",
    });

    const comments = await post("/api/getComments", owner, { cardId: board.cardId });
    const edited = comments.body.find((c: { comment_id: number }) => c.comment_id === memberComment);
    expect(edited).toMatchObject({ body: "Changed", updated_at: expect.any(String) });
  });

  it("does not let the board owner edit someone else's comment", async () => {
    const res = await post("/api/updateComment", owner, { commentId: memberComment, body: "Owner rewrite" });
    expect(res.status).toBe(404);
    expect(await commentRow(memberComment)).toEqual({ body: "Original", updated_at: null });
  });

  it("does not let a stranger edit a comment", async () => {
    const res = await post("/api/updateComment", stranger, { commentId: memberComment, body: "Hijacked" });
    expect(res.status).toBe(404);
    expect((await commentRow(memberComment)).body).toBe("Original");
  });

  it("does not let an author edit after losing access to the board", async () => {
    const leaver = await createUser("leaver");
    await pool.query("INSERT INTO board_members (board_id, user_id) VALUES ($1, $2)", [board.boardId, leaver.id]);
    const id = await addComment(leaver, "Before leaving");
    await pool.query("DELETE FROM board_members WHERE user_id = $1", [leaver.id]);

    const res = await post("/api/updateComment", leaver, { commentId: id, body: "After leaving" });
    expect(res.status).toBe(404);
  });

  it.each([
    ["missing body", { commentId: 1 }],
    ["blank body", { commentId: 1, body: "   " }],
    ["non-string body", { commentId: 1, body: 123 }],
    ["body over 5000 characters", { commentId: 1, body: "a".repeat(5001) }],
    ["missing commentId", { body: "Hi" }],
    ["non-numeric commentId", { commentId: "abc", body: "Hi" }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await post("/api/updateComment", member, body);
    expect(res.status).toBe(400);
  });

  it("returns 404 for a comment that doesn't exist", async () => {
    const res = await post("/api/updateComment", member, { commentId: 999999, body: "Ghost" });
    expect(res.status).toBe(404);
  });

  it("requires a token", async () => {
    const res = await request(app).post("/api/updateComment").send({ commentId: memberComment, body: "Anon" });
    expect(res.status).toBe(401);
  });
});

describe("deleteComment", () => {
  it("lets the author delete their comment", async () => {
    const id = await addComment(member, "Mine");
    const res = await post("/api/deleteComment", member, { commentId: id });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ comment_id: id });
    expect(await commentRow(id)).toBeUndefined();
  });

  it("lets the board owner delete someone else's comment", async () => {
    const id = await addComment(member, "Spam");
    const res = await post("/api/deleteComment", owner, { commentId: id });
    expect(res.status).toBe(200);
    expect(await commentRow(id)).toBeUndefined();
  });

  it("does not let a member delete someone else's comment", async () => {
    const id = await addComment(owner, "Owner's note");
    const res = await post("/api/deleteComment", member, { commentId: id });
    expect(res.status).toBe(404);
    expect(await commentRow(id)).toBeDefined();
  });

  it("does not let a stranger delete a comment", async () => {
    const id = await addComment(member, "Keep me");
    const res = await post("/api/deleteComment", stranger, { commentId: id });
    expect(res.status).toBe(404);
    expect(await commentRow(id)).toBeDefined();
  });

  it("returns 404 when the comment is already gone", async () => {
    const id = await addComment(member, "Twice");
    await post("/api/deleteComment", member, { commentId: id });
    const res = await post("/api/deleteComment", member, { commentId: id });
    expect(res.status).toBe(404);
  });

  it("returns 400 for a bad commentId", async () => {
    const res = await post("/api/deleteComment", member, { commentId: "abc" });
    expect(res.status).toBe(400);
  });

  it("requires a token", async () => {
    const res = await request(app).post("/api/deleteComment").send({ commentId: 1 });
    expect(res.status).toBe(401);
  });
});

describe("getTaskDetails", () => {
  // the modal uses this to decide whether to show Delete on other people's comments
  it("includes the board owner's id", async () => {
    const res = await post("/api/getTaskDetails", member, { cardId: board.cardId });
    expect(res.body.board_owner_id).toBe(owner.id);
  });
});
