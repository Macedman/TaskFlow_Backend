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

// Each of these used to reach Postgres, which threw (500) instead of the client getting a 400
const badIds: [string, unknown][] = [
  ["an empty string", ""],
  ["a blank string", "  "],
  ["a number too large for INTEGER", 2147483648],
  ["exponent notation", "1e3"],
  ["a boolean", true],
];

// [route, field that holds the id, the rest of a valid body]
const idRoutes: [string, string, Record<string, unknown>][] = [
  ["/api/getTasks", "boardId", {}],
  ["/api/getTaskDetails", "cardId", {}],
  ["/api/addList", "boardId", { name: "Backlog" }],
  ["/api/addTask", "listId", { title: "Task" }],
  ["/api/updateList", "listId", { name: "Renamed" }],
  ["/api/updateCard", "cardId", { title: "Renamed" }],
  ["/api/moveCard", "cardId", { listId: 1, position: 0 }],
  ["/api/moveCard", "listId", { cardId: 1, position: 0 }],
  ["/api/getBoardMembers", "boardId", {}],
  ["/api/addBoardMember", "boardId", { email: "someone@example.test" }],
  ["/api/removeBoardMember", "boardId", { memberId: 1 }],
  ["/api/removeBoardMember", "memberId", { boardId: 1 }],
  ["/api/addComment", "cardId", { body: "Hi" }],
  ["/api/getComments", "cardId", {}],
  ["/api/updateComment", "commentId", { body: "Hi" }],
  ["/api/deleteComment", "commentId", {}],
  ["/api/addLinkAttachment", "cardId", { url: "https://example.com" }],
  ["/api/getAttachments", "cardId", {}],
  ["/api/deleteAttachment", "attachmentId", {}],
  ["/api/getAttachmentDownloadUrl", "attachmentId", {}],
];

describe.each(idRoutes)("%s", (route, field, rest) => {
  it.each(badIds)(`returns 400 when ${field} is %s`, async (_label, id) => {
    const res = await request(app)
      .post(route)
      .set(as(owner))
      .send({ ...rest, [field]: id });
    expect(res.status).toBe(400);
  });
});

describe("name lengths", () => {
  const tooLong = "a".repeat(256);

  it("addList returns 400 for a name over 255 characters", async () => {
    const res = await request(app)
      .post("/api/addList")
      .set(as(owner))
      .send({ boardId: board.boardId, name: tooLong });
    expect(res.status).toBe(400);
  });

  it("addTask returns 400 for a title over 255 characters", async () => {
    const res = await request(app)
      .post("/api/addTask")
      .set(as(owner))
      .send({ listId: board.listId, title: tooLong });
    expect(res.status).toBe(400);
  });

  it("addTask returns 400 for a blank title", async () => {
    const res = await request(app)
      .post("/api/addTask")
      .set(as(owner))
      .send({ listId: board.listId, title: "   " });
    expect(res.status).toBe(400);
  });

  it("createBoards returns 400 for a name over 255 characters", async () => {
    const res = await request(app)
      .post("/api/createBoards")
      .set(as(owner))
      .send({ name: tooLong });
    expect(res.status).toBe(400);
  });

  it("still accepts a name of exactly 255 characters", async () => {
    const res = await request(app)
      .post("/api/addList")
      .set(as(owner))
      .send({ boardId: board.boardId, name: "a".repeat(255) });
    expect(res.status).toBe(201);
  });
});
