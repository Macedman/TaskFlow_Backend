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

// While `slow` is on, saving a file waits a moment inside the upload's transaction, so a second
// upload really runs while the first one is still open (otherwise they just take turns)
const saves = vi.hoisted(() => ({ slow: false }));
vi.mock("../src/storage/storage", async importOriginal => {
  const original = await importOriginal<typeof import("../src/storage/storage")>();
  return {
    ...original,
    saveFile: async (...args: Parameters<typeof original.saveFile>) => {
      if (saves.slow) await new Promise(resolve => setTimeout(resolve, 300));
      return original.saveFile(...args);
    },
  };
});

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

// The stored key and bytes for an attachment, read straight from the database
const storedFile = async (attachmentId: number) => {
  const { rows } = await pool.query(
    `SELECT a.storage_key, f.data FROM card_attachments a
    LEFT JOIN attachment_files f ON f.storage_key = a.storage_key
    WHERE a.id = $1`,
    [attachmentId]
  );
  return rows[0] as { storage_key: string; data: Buffer | null } | undefined;
};

const fileIsStored = async (storageKey: string) =>
  (await pool.query("SELECT 1 FROM attachment_files WHERE storage_key = $1", [storageKey])).rows.length > 0;

const countFiles = async () =>
  (await pool.query("SELECT COUNT(*)::int AS n FROM attachment_files")).rows[0].n;

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
    expect(file!.storage_key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(Buffer.compare(file!.data!, pdfBytes())).toBe(0);
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
    // the name is display text only; the file is stored under a key we made up
    expect((await storedFile(res.body.attachment_id))!.storage_key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
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

  it("rejects a file over 5 MB", async () => {
    const before = await countAttachments();
    const big = Buffer.concat([pdfBytes(), Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(owner, big, "big.pdf");
    expect(res.status).toBe(413);
    expect(await countAttachments()).toBe(before);
  });

  it("accepts a file of exactly 5 MB", async () => {
    const exact = Buffer.concat([pdfBytes(), Buffer.alloc(5 * 1024 * 1024 - pdfBytes().length)]);
    const res = await upload(owner, exact, "exact.pdf");
    expect(res.status).toBe(201);
    expect(res.body.size_bytes).toBe(5 * 1024 * 1024);
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

  // Browsers misread raw non-ASCII bytes in a header ("résumé.pdf" saved as "rýsumý.pdf"),
  // so the exact name goes in filename* (UTF-8) and filename gets a readable ASCII stand-in
  it.each([
    ["résumé.pdf", "resume.pdf", "r%C3%A9sum%C3%A9.pdf"],
    ["naïve—plan.pdf", "naive_plan.pdf", "na%C3%AFve%E2%80%94plan.pdf"],
  ])("downloads %s under its exact name, with an ASCII-only header", async (name, fallback, encoded) => {
    const id = (await upload(owner, pdfBytes(), name)).body.attachment_id;
    const { url } = (await downloadUrl(owner, id)).body;

    const file = await request(app).get(url);

    const header = file.headers["content-disposition"];
    expect(header).toMatch(/^[\x20-\x7e]*$/);
    expect(header).toBe(`attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`);
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
    const { storage_key } = (await storedFile(id))!;
    expect(await fileIsStored(storage_key)).toBe(true);

    const res = await request(app).post("/api/deleteAttachment").set(as(member)).send({ attachmentId: id });
    expect(res.status).toBe(200);
    expect(await fileIsStored(storage_key)).toBe(false);
  });

  // there's no delete-card endpoint yet, so delete the row the way one would
  it("removes a card's files when the card itself is deleted", async () => {
    const card = await pool.query(
      "INSERT INTO cards (list_id, title, position) VALUES ($1, 'Doomed', 99) RETURNING id",
      [board.listId]
    );
    const id = (await upload(owner, pdfBytes(), "doomed.pdf", card.rows[0].id)).body.attachment_id;
    const { storage_key } = (await storedFile(id))!;
    expect(await fileIsStored(storage_key)).toBe(true);

    await pool.query("DELETE FROM cards WHERE id = $1", [card.rows[0].id]);

    expect(await fileIsStored(storage_key)).toBe(false);
  });
});

describe("the total storage cap", () => {
  const original = process.env.ATTACHMENT_STORAGE_LIMIT_MB;
  afterEach(() => {
    if (original === undefined) delete process.env.ATTACHMENT_STORAGE_LIMIT_MB;
    else process.env.ATTACHMENT_STORAGE_LIMIT_MB = original;
  });

  const storedBytes = async () =>
    (await pool.query("SELECT COALESCE(SUM(size_bytes), 0)::int AS n FROM card_attachments WHERE kind = 'pdf'")).rows[0].n;
  // sets the cap to what's stored now plus room for `extra` bytes
  const capWithRoomFor = async (extra: number) => {
    process.env.ATTACHMENT_STORAGE_LIMIT_MB = String(((await storedBytes()) + extra) / (1024 * 1024));
  };

  it("refuses an upload that would go over the cap, counting what is already stored", async () => {
    await capWithRoomFor(pdfBytes().length);
    expect((await upload(owner, pdfBytes(), "fits.pdf")).status).toBe(201);

    const before = await countFiles();
    const res = await upload(owner, pdfBytes(), "one-too-many.pdf");
    expect(res.status).toBe(507);
    expect(res.body.message).toBe("Storage is full. Delete some PDFs to make room.");
    expect(await countFiles()).toBe(before);
  });

  it("still lets everything else save when storage is full", async () => {
    await capWithRoomFor(0);
    expect((await upload(owner, pdfBytes(), "full.pdf")).status).toBe(507);

    const card = await request(app).post("/api/addTask").set(as(owner)).send({ listId: board.listId, title: "Still works" });
    expect(card.status).toBe(201);
    const comment = await request(app).post("/api/addComment").set(as(owner)).send({ cardId: board.cardId, body: "Still works" });
    expect(comment.status).toBe(201);
    const link = await request(app).post("/api/addLinkAttachment").set(as(owner)).send({ cardId: board.cardId, url: "https://example.com" });
    expect(link.status).toBe(201);
  });

  it("lets only one of two uploads at the same moment take the last bit of room", async () => {
    await capWithRoomFor(pdfBytes().length);
    saves.slow = true;

    try {
      const results = await Promise.all([upload(owner, pdfBytes(), "a.pdf"), upload(member, pdfBytes(), "b.pdf")]);
      expect(results.map(r => r.status).sort()).toEqual([201, 507]);
    } finally {
      saves.slow = false;
    }
  });

  it("makes room again once a PDF is deleted", async () => {
    await capWithRoomFor(0);
    expect((await upload(owner, pdfBytes(), "blocked.pdf")).status).toBe(507);

    const { rows } = await pool.query(
      "SELECT id FROM card_attachments WHERE kind = 'pdf' AND user_id = $1 ORDER BY id DESC LIMIT 1",
      [owner.id]
    );
    // the newest is one of the small test PDFs, so deleting it frees exactly the room needed
    await request(app).post("/api/deleteAttachment").set(as(owner)).send({ attachmentId: rows[0].id });

    expect((await upload(owner, pdfBytes(), "unblocked.pdf")).status).toBe(201);
  });
});
