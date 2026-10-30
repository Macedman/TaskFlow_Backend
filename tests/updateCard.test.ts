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
let stranger: TestUser;
let board: Awaited<ReturnType<typeof createBoardWithCard>>;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("owner");
  stranger = await createUser("stranger");
  board = await createBoardWithCard(owner);
});
afterAll(() => pool.end());

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

const updateCard = (user: TestUser, body: object) =>
  request(app).post("/api/updateCard").set(as(user)).send(body);

const getCard = () =>
  request(app)
    .post("/api/getTaskDetails")
    .set(as(owner))
    .send({ cardId: board.cardId });

describe("updateCard", () => {
  it("adds a description without changing the title", async () => {
    const res = await updateCard(owner, {
      cardId: board.cardId,
      description: "First description",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      card_id: board.cardId,
      card_title: "Secret task",
      description: "First description",
    });

    const card = await getCard();
    expect(card.body.description).toBe("First description");
  });

  it("changes the title without changing the description", async () => {
    const res = await updateCard(owner, { cardId: board.cardId, title: "  Renamed  " });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      card_id: board.cardId,
      card_title: "Renamed",
      description: "First description",
    });
  });

  it("updates both fields in one request", async () => {
    const res = await updateCard(owner, {
      cardId: board.cardId,
      title: "Both",
      description: "Both changed",
    });
    expect(res.status).toBe(200);
    expect(res.body.card_title).toBe("Both");
    expect(res.body.description).toBe("Both changed");
  });

  it("clears the description with an empty string", async () => {
    const res = await updateCard(owner, { cardId: board.cardId, description: "" });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("");
    expect(res.body.card_title).toBe("Both");
  });

  it("lets a board member edit a card", async () => {
    const member = await createUser("member");
    await pool.query(
      "INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'member')",
      [board.boardId, member.id]
    );

    const res = await updateCard(member, { cardId: board.cardId, description: "From member" });
    expect(res.status).toBe(200);
  });

  it.each([
    ["no fields to change", { cardId: 1 }],
    ["missing cardId", { title: "Title" }],
    ["non-numeric cardId", { cardId: "abc", title: "Title" }],
    ["blank title", { cardId: 1, title: "   " }],
    ["non-string title", { cardId: 1, title: 123 }],
    ["null title", { cardId: 1, title: null }],
    ["title over 255 characters", { cardId: 1, title: "a".repeat(256) }],
    ["non-string description", { cardId: 1, description: 123 }],
    ["null description", { cardId: 1, description: null }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await updateCard(owner, body);
    expect(res.status).toBe(400);
  });

  it("returns 404 for a card that doesn't exist", async () => {
    const res = await updateCard(owner, { cardId: 999999, title: "Ghost" });
    expect(res.status).toBe(404);
  });

  it("cannot edit a card on another user's board", async () => {
    const res = await updateCard(stranger, { cardId: board.cardId, title: "Hijacked" });
    expect(res.status).toBe(404);

    const { rows } = await pool.query("SELECT title FROM cards WHERE id = $1", [board.cardId]);
    expect(rows[0].title).not.toBe("Hijacked");
  });

  it("requires a token", async () => {
    const res = await request(app)
      .post("/api/updateCard")
      .send({ cardId: board.cardId, title: "Anon" });
    expect(res.status).toBe(401);
  });
});
