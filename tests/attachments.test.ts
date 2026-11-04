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

const post = (path: string, user: TestUser, body: object) =>
  request(app).post(path).set(as(user)).send(body);

const addLink = (user: TestUser, body: object) =>
  post("/api/addLinkAttachment", user, { cardId: board.cardId, ...body });

const getAttachments = (user: TestUser, cardId: unknown) =>
  post("/api/getAttachments", user, { cardId });

const attachmentRow = async (id: number) =>
  (await pool.query("SELECT id FROM card_attachments WHERE id = $1", [id])).rows[0];

const countAttachments = async () =>
  (await pool.query("SELECT COUNT(*)::int AS n FROM card_attachments")).rows[0].n;

describe("getAttachments", () => {
  it("returns an empty array for a card with no attachments", async () => {
    const res = await getAttachments(owner, board.cardId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("addLinkAttachment", () => {
  it("saves a link with display text and the caller as its author", async () => {
    const res = await addLink(owner, { url: "  https://example.com/spec  ", name: "  The spec  " });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      attachment_id: expect.any(Number),
      kind: "link",
      name: "The spec",
      url: "https://example.com/spec",
      size_bytes: null,
      created_at: expect.any(String),
      user_id: owner.id,
      author_name: "owner",
    });
  });

  it("allows a link without display text", async () => {
    const res = await addLink(member, { url: "http://example.com" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBeNull();
    expect(res.body.user_id).toBe(member.id);
  });

  it("treats blank display text as none", async () => {
    const res = await addLink(owner, { url: "https://example.com/blank", name: "   " });
    expect(res.status).toBe(201);
    expect(res.body.name).toBeNull();
  });

  it.each([
    ["missing url", {}],
    ["non-string url", { url: 123 }],
    ["text that isn't a url", { url: "not a link" }],
    ["a javascript: url", { url: "javascript:alert(1)" }],
    ["a data: url", { url: "data:text/html,<script>alert(1)</script>" }],
    ["an ftp: url", { url: "ftp://example.com/file" }],
    ["a mailto: url", { url: "mailto:someone@example.com" }],
    ["a url over 2048 characters", { url: `https://example.com/${"a".repeat(2048)}` }],
    ["display text over 255 characters", { url: "https://example.com", name: "a".repeat(256) }],
    ["non-string display text", { url: "https://example.com", name: 123 }],
    ["a bad cardId", { cardId: "abc", url: "https://example.com" }],
  ])("returns 400 for %s", async (_label, body) => {
    const before = await countAttachments();
    const res = await addLink(owner, body);
    expect(res.status).toBe(400);
    expect(await countAttachments()).toBe(before);
  });

  it("returns 404 for a card that doesn't exist", async () => {
    const res = await post("/api/addLinkAttachment", owner, { cardId: 999999, url: "https://example.com" });
    expect(res.status).toBe(404);
  });

  it("cannot attach to a card on another user's board", async () => {
    const before = await countAttachments();
    const res = await addLink(stranger, { url: "https://evil.example.com" });
    expect(res.status).toBe(404);
    expect(await countAttachments()).toBe(before);
  });

  it("requires a token", async () => {
    const res = await request(app)
      .post("/api/addLinkAttachment")
      .send({ cardId: board.cardId, url: "https://example.com" });
    expect(res.status).toBe(401);
  });
});

describe("getAttachments after attaching", () => {
  it("returns the card's attachments newest first", async () => {
    const res = await getAttachments(member, board.cardId);
    expect(res.status).toBe(200);
    expect(res.body.map((a: { url: string }) => a.url)).toEqual([
      "https://example.com/blank",
      "http://example.com/",
      "https://example.com/spec",
    ]);
  });

  it("never exposes where a file is stored", async () => {
    const res = await getAttachments(owner, board.cardId);
    for (const attachment of res.body) {
      expect(attachment).not.toHaveProperty("storage_key");
    }
  });

  it("only returns attachments for the requested card", async () => {
    const other = await createBoardWithCard(owner);
    await post("/api/addLinkAttachment", owner, { cardId: other.cardId, url: "https://elsewhere.example.com" });

    const res = await getAttachments(owner, board.cardId);
    expect(res.body.map((a: { url: string }) => a.url)).not.toContain("https://elsewhere.example.com/");
  });

  it("returns 400 for a bad cardId", async () => {
    const res = await getAttachments(owner, "abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 for a card that doesn't exist", async () => {
    const res = await getAttachments(owner, 999999);
    expect(res.status).toBe(404);
  });

  it("cannot read attachments on another user's board", async () => {
    const res = await getAttachments(stranger, board.cardId);
    expect(res.status).toBe(404);
  });

  it("requires a token", async () => {
    const res = await request(app).post("/api/getAttachments").send({ cardId: board.cardId });
    expect(res.status).toBe(401);
  });
});

describe("deleteAttachment", () => {
  const attach = async (user: TestUser) =>
    (await addLink(user, { url: "https://example.com/to-delete" })).body.attachment_id as number;

  it("lets the uploader delete their attachment", async () => {
    const id = await attach(member);
    const res = await post("/api/deleteAttachment", member, { attachmentId: id });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ attachment_id: id });
    expect(await attachmentRow(id)).toBeUndefined();
  });

  it("lets the board owner delete someone else's attachment", async () => {
    const id = await attach(member);
    const res = await post("/api/deleteAttachment", owner, { attachmentId: id });
    expect(res.status).toBe(200);
    expect(await attachmentRow(id)).toBeUndefined();
  });

  it("does not let a member delete someone else's attachment", async () => {
    const id = await attach(owner);
    const res = await post("/api/deleteAttachment", member, { attachmentId: id });
    expect(res.status).toBe(404);
    expect(await attachmentRow(id)).toBeDefined();
  });

  it("does not let a stranger delete an attachment", async () => {
    const id = await attach(member);
    const res = await post("/api/deleteAttachment", stranger, { attachmentId: id });
    expect(res.status).toBe(404);
    expect(await attachmentRow(id)).toBeDefined();
  });

  it("returns 404 when the attachment is already gone", async () => {
    const id = await attach(member);
    await post("/api/deleteAttachment", member, { attachmentId: id });
    const res = await post("/api/deleteAttachment", member, { attachmentId: id });
    expect(res.status).toBe(404);
  });

  it("returns 400 for a bad attachmentId", async () => {
    const res = await post("/api/deleteAttachment", member, { attachmentId: "abc" });
    expect(res.status).toBe(400);
  });

  it("requires a token", async () => {
    const res = await request(app).post("/api/deleteAttachment").send({ attachmentId: 1 });
    expect(res.status).toBe(401);
  });
});
