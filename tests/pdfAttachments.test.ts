import { existsSync } from "fs";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
afterEach(() => vi.useRealTimers());

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

// The smallest thing that starts like a real PDF
const pdfBytes = (text = "hello") => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

const upload = (user: TestUser, file: Buffer | null, fileName = "spec.pdf", cardId: unknown = board.cardId) => {
  const req = request(app).post("/api/uploadPdfAttachment").set(as(user));
  if (cardId !== undefined) req.field("cardId", String(cardId));
  if (file) req.attach("file", file, { filename: fileName, contentType: "application/pdf" });
  return req;
};

const storedFile = async (attachmentId: number) => {
  const { rows } = await pool.query("SELECT storage_key FROM card_attachments WHERE id = $1", [attachmentId]);
  return rows[0] ? path.join(process.env.UPLOADS_DIR as string, rows[0].storage_key) : null;
};

const countAttachments = async () =>
  (await pool.query("SELECT COUNT(*)::int AS n FROM card_attachments")).rows[0].n;

const downloadUrl = (user: TestUser, attachmentId: unknown) =>
  request(app).post("/api/getAttachmentDownloadUrl").set(as(user)).send({ attachmentId });

describe("uploadPdfAttachment", () => {
  it("saves the PDF under a random name and returns it like any attachment", async () => {
    const res = await upload(member, pdfBytes(), "spec.pdf");
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      attachment_id: expect.any(Number),
      kind: "pdf",
      name: "spec.pdf",
      url: null,
      size_bytes: pdfBytes().length,
      created_at: expect.any(String),
      user_id: member.id,
      author_name: "member",
    });

    const file = await storedFile(res.body.attachment_id);
    expect(path.basename(file!)).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(existsSync(file!)).toBe(true);
  });

  it("keeps a non-English file name intact", async () => {
    const res = await upload(owner, pdfBytes(), "résumé.pdf");
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("résumé.pdf");
  });

  it("uses only the last part of a file name that contains a path", async () => {
    const res = await upload(owner, pdfBytes(), "../../evil.pdf");
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("evil.pdf");
    expect(path.dirname((await storedFile(res.body.attachment_id))!)).toBe(process.env.UPLOADS_DIR);
  });

  it("shows up in getAttachments without revealing where it is stored", async () => {
    const res = await request(app).post("/api/getAttachments").set(as(owner)).send({ cardId: board.cardId });
    const pdf = res.body.find((a: { kind: string }) => a.kind === "pdf");
    expect(pdf).toBeDefined();
    expect(pdf).not.toHaveProperty("storage_key");
  });

  it("rejects a file that isn't really a PDF, even when it is named .pdf", async () => {
    const before = await countAttachments();
    const res = await upload(owner, Buffer.from("MZ\x90\x00 this is an exe"), "invoice.pdf");
    expect(res.status).toBe(400);
    expect(await countAttachments()).toBe(before);
  });

  it("rejects a file over 10 MB", async () => {
    const before = await countAttachments();
    const big = Buffer.concat([pdfBytes(), Buffer.alloc(10 * 1024 * 1024)]);
    const res = await upload(owner, big, "big.pdf");
    expect(res.status).toBe(413);
    expect(await countAttachments()).toBe(before);
  });

  it("returns 400 without a file", async () => {
    const res = await upload(owner, null);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a bad cardId", async () => {
    const res = await upload(owner, pdfBytes(), "spec.pdf", "abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 for a card that doesn't exist", async () => {
    const res = await upload(owner, pdfBytes(), "spec.pdf", 999999);
    expect(res.status).toBe(404);
  });

  it("cannot upload to a card on another user's board, and writes nothing", async () => {
    const before = await countAttachments();
    const res = await upload(stranger, pdfBytes(), "spec.pdf");
    expect(res.status).toBe(404);
    expect(await countAttachments()).toBe(before);
  });

  it("requires a token", async () => {
    const res = await request(app)
      .post("/api/uploadPdfAttachment")
      .field("cardId", String(board.cardId))
      .attach("file", pdfBytes(), "spec.pdf");
    expect(res.status).toBe(401);
  });
});

describe("downloading a PDF", () => {
  let attachmentId: number;
  const content = pdfBytes("download me");

  beforeAll(async () => {
    attachmentId = (await upload(member, content, "notes.pdf")).body.attachment_id;
  });

  it("gives a board member a link that downloads the same file", async () => {
    const res = await downloadUrl(owner, attachmentId);
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/api\/files\//);

    // no Authorization header: the link itself is the permission
    const file = await request(app).get(res.body.url).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("application/pdf");
    expect(file.headers["content-disposition"]).toContain('attachment; filename="notes.pdf"');
    expect(Buffer.compare(file.body, content)).toBe(0);
  });

  it("does not give a stranger a link", async () => {
    const res = await downloadUrl(stranger, attachmentId);
    expect(res.status).toBe(404);
  });

  it("has nothing to download for a link attachment", async () => {
    const link = await request(app)
      .post("/api/addLinkAttachment")
      .set(as(owner))
      .send({ cardId: board.cardId, url: "https://example.com" });
    const res = await downloadUrl(owner, link.body.attachment_id);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a bad attachmentId", async () => {
    const res = await downloadUrl(owner, "abc");
    expect(res.status).toBe(400);
  });

  it("rejects a link that was tampered with", async () => {
    const { url } = (await downloadUrl(owner, attachmentId)).body;
    const res = await request(app).get(`${url}x`);
    expect(res.status).toBe(404);
  });

  it("rejects a link after it expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { url } = (await downloadUrl(owner, attachmentId)).body;
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);

    const res = await request(app).get(url);
    expect(res.status).toBe(404);
  });

  it("does not accept a login token as a download link", async () => {
    const res = await request(app).get(`/api/files/${owner.token}`);
    expect(res.status).toBe(404);
  });

  it("does not accept a download link as a login token", async () => {
    const { url } = (await downloadUrl(owner, attachmentId)).body;
    const downloadToken = url.split("/").pop();
    const res = await request(app)
      .post("/api/getBoards")
      .set({ Authorization: `Bearer ${downloadToken}` });
    expect(res.status).toBe(401);
  });
});

describe("deleting a PDF", () => {
  it("removes the stored file too", async () => {
    const id = (await upload(member, pdfBytes(), "temp.pdf")).body.attachment_id;
    const file = await storedFile(id);
    expect(existsSync(file!)).toBe(true);

    const res = await request(app).post("/api/deleteAttachment").set(as(member)).send({ attachmentId: id });
    expect(res.status).toBe(200);
    expect(existsSync(file!)).toBe(false);
  });
});
