import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, createUser, pool, resetDatabase, TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let invitee: TestUser;
let stranger: TestUser;
let boardId: number;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("owner");
  member = await createUser("member");
  invitee = await createUser("invitee");
  stranger = await createUser("stranger");
});
afterAll(() => pool.end());

// A fresh board for every test, owned by `owner` and shared with `member`
beforeEach(async () => {
  boardId = (await pool.query("INSERT INTO boards (name, owner_id) VALUES ('Team board', $1) RETURNING id", [owner.id])).rows[0].id;
  await pool.query("INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'member')", [boardId, member.id]);
});

const post = (user: TestUser, path: string, body: object) =>
  request(app).post(path).set("Authorization", `Bearer ${user.token}`).send(body);

const invite = (user: TestUser, email: string, board = boardId) => post(user, "/api/addBoardMember", { boardId: board, email });
const remove = (user: TestUser, memberId: unknown, board = boardId) => post(user, "/api/removeBoardMember", { boardId: board, memberId });
const memberIds = async () =>
  (await post(owner, "/api/getBoardMembers", { boardId })).body.map((m: { user_id: number }) => m.user_id);

describe("getBoardMembers", () => {
  it("lists the owner first, then the members, with names and emails", async () => {
    const res = await post(member, "/api/getBoardMembers", { boardId });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { user_id: owner.id, full_name: "owner", email: owner.email.toLowerCase(), role: "owner" },
      { user_id: member.id, full_name: "member", email: member.email.toLowerCase(), role: "member" },
    ]);
  });

  it("never shows password hashes", async () => {
    const res = await post(owner, "/api/getBoardMembers", { boardId });
    expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/);
  });

  it("answers 404 to someone not on the board", async () => {
    expect((await post(stranger, "/api/getBoardMembers", { boardId })).status).toBe(404);
  });

  it.each([[{}], [{ boardId: "abc" }]])("answers 400 to a bad boardId %j", async (body) => {
    expect((await post(owner, "/api/getBoardMembers", body)).status).toBe(400);
  });
});

describe("addBoardMember", () => {
  it("lets the owner add an existing account by email", async () => {
    const res = await invite(owner, invitee.email);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ user_id: invitee.id, full_name: "invitee", email: invitee.email.toLowerCase(), role: "member" });
    expect(await memberIds()).toContain(invitee.id);
  });

  it("gives the new member access to the board straight away", async () => {
    await invite(owner, invitee.email).expect(201);

    const boards = await post(invitee, "/api/getBoards", {});
    expect(boards.body.map((b: { id: number }) => b.id)).toContain(boardId);
    expect((await post(invitee, "/api/getTasks", { boardId })).status).toBe(200);
  });

  it("matches the email the way login does: any case, spaces around it", async () => {
    const res = await invite(owner, `  ${invitee.email.toUpperCase()} `);
    expect(res.status).toBe(201);
    expect(res.body.user_id).toBe(invitee.id);
  });

  it("says so when no account has that email", async () => {
    const res = await invite(owner, "nobody-here@example.test");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("No account with that email");
  });

  it("answers 409 for someone already on the board", async () => {
    const res = await invite(owner, member.email);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already on this board/i);
  });

  it("answers 409 when the owner invites themselves", async () => {
    const res = await invite(owner, owner.email);
    expect(res.status).toBe(409);
    expect(await memberIds()).toEqual([owner.id, member.id]);
  });

  it("only lets the owner invite: a member gets 403 and nothing is added", async () => {
    const res = await invite(member, invitee.email);
    expect(res.status).toBe(403);
    expect(await memberIds()).not.toContain(invitee.id);
  });

  it("answers 404 to someone not on the board, without saying whether the email exists", async () => {
    const res = await invite(stranger, invitee.email);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Board not found");
    expect(await memberIds()).not.toContain(invitee.id);
  });

  it.each([
    ["no boardId", { email: "x@example.test" }],
    ["a bad boardId", { boardId: "abc", email: "x@example.test" }],
    ["no email", { boardId: 1 }],
    ["a malformed email", { boardId: 1, email: "not-an-email" }],
    ["an email that isn't a string", { boardId: 1, email: ["x@example.test"] }],
  ])("answers 400 to %s", async (_name, body) => {
    expect((await post(owner, "/api/addBoardMember", body)).status).toBe(400);
  });
});

describe("removeBoardMember", () => {
  it("lets the owner remove a member, who loses access at once", async () => {
    const res = await remove(owner, member.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user_id: member.id });
    expect(await memberIds()).toEqual([owner.id]);
    expect((await post(member, "/api/getTasks", { boardId })).status).toBe(404);
  });

  it("only lets the owner remove: a member gets 403, even removing themselves", async () => {
    await invite(owner, invitee.email).expect(201);

    expect((await remove(member, invitee.id)).status).toBe(403);
    expect((await remove(member, member.id)).status).toBe(403);
    expect(await memberIds()).toEqual(expect.arrayContaining([member.id, invitee.id]));
  });

  it("answers 404 to someone not on the board", async () => {
    expect((await remove(stranger, member.id)).status).toBe(404);
    expect(await memberIds()).toContain(member.id);
  });

  it("answers 404 for someone who isn't a member, including the owner", async () => {
    expect((await remove(owner, stranger.id)).status).toBe(404);
    expect((await remove(owner, owner.id)).status).toBe(404);
    expect(await memberIds()).toEqual([owner.id, member.id]);
  });

  it.each([
    ["no memberId", { boardId: 1 }],
    ["a bad memberId", { boardId: 1, memberId: "abc" }],
    ["a bad boardId", { boardId: "abc", memberId: 1 }],
  ])("answers 400 to %s", async (_name, body) => {
    expect((await post(owner, "/api/removeBoardMember", body)).status).toBe(400);
  });
});
