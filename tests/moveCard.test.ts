import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, createUser, pool, resetDatabase, TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let stranger: TestUser;
let boardId: number;
let todo: number;
let doing: number;
let card: Record<string, number>;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("owner");
  member = await createUser("member");
  stranger = await createUser("stranger");
});
afterAll(() => pool.end());

// A fresh board for every test: To Do = a0, a1, a2 and Doing = b0
beforeEach(async () => {
  boardId = (await pool.query("INSERT INTO boards (name, owner_id) VALUES ('Move board', $1) RETURNING id", [owner.id])).rows[0].id;
  await pool.query("INSERT INTO board_members (board_id, user_id) VALUES ($1, $2)", [boardId, member.id]);
  todo = (await pool.query("INSERT INTO lists (board_id, name, position) VALUES ($1, 'To Do', 0) RETURNING id", [boardId])).rows[0].id;
  doing = (await pool.query("INSERT INTO lists (board_id, name, position) VALUES ($1, 'Doing', 1) RETURNING id", [boardId])).rows[0].id;
  card = {};
  for (const [title, listId, position] of [["a0", todo, 0], ["a1", todo, 1], ["a2", todo, 2], ["b0", doing, 0]] as const) {
    card[title] = (await pool.query(
      "INSERT INTO cards (list_id, title, position) VALUES ($1, $2, $3) RETURNING id",
      [listId, title, position]
    )).rows[0].id;
  }
});

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

const moveCard = (user: TestUser, body: object) =>
  request(app).post("/api/moveCard").set(as(user)).send(body);

// What the board shows after a reload: list name -> card titles in order
const boardOrder = async () => {
  const res = await request(app).post("/api/getTasks").set(as(owner)).send({ boardId });
  return Object.fromEntries(
    res.body.map((l: { listName: string; cards: { card_title: string }[] }) => [l.listName, l.cards.map(c => c.card_title)])
  );
};

// Every list's positions must be 0, 1, 2... with no gaps or duplicates
const positionsAreClean = async () => {
  const { rows } = await pool.query(
    `SELECT list_id, array_agg(position ORDER BY position) AS positions
    FROM cards WHERE list_id = ANY($1) GROUP BY list_id`,
    [[todo, doing]]
  );
  return rows.every((r: { positions: number[] }) => r.positions.every((p, i) => p === i));
};

describe("moveCard", () => {
  it("reorders a card within its list", async () => {
    const res = await moveCard(owner, { cardId: card.a0, listId: todo, position: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ card_id: card.a0, list_id: todo, position: 2 });
    expect(await boardOrder()).toEqual({ "To Do": ["a1", "a2", "a0"], Doing: ["b0"] });
    expect(await positionsAreClean()).toBe(true);
  });

  it("moves a card up within its list", async () => {
    await moveCard(owner, { cardId: card.a2, listId: todo, position: 0 });
    expect(await boardOrder()).toEqual({ "To Do": ["a2", "a0", "a1"], Doing: ["b0"] });
  });

  it("moves a card to another list and closes the gap it left", async () => {
    const res = await moveCard(owner, { cardId: card.a1, listId: doing, position: 0 });
    expect(res.status).toBe(200);
    expect(await boardOrder()).toEqual({ "To Do": ["a0", "a2"], Doing: ["a1", "b0"] });
    expect(await positionsAreClean()).toBe(true);
  });

  it("moves a card into an empty list", async () => {
    const empty = (await pool.query("INSERT INTO lists (board_id, name, position) VALUES ($1, 'Done', 2) RETURNING id", [boardId])).rows[0].id;
    await moveCard(owner, { cardId: card.b0, listId: empty, position: 0 });
    expect(await boardOrder()).toEqual({ "To Do": ["a0", "a1", "a2"], Doing: [], Done: ["b0"] });
  });

  it("puts a card last when the position is past the end", async () => {
    const res = await moveCard(owner, { cardId: card.a0, listId: doing, position: 99 });
    expect(res.body.position).toBe(1);
    expect(await boardOrder()).toEqual({ "To Do": ["a1", "a2"], Doing: ["b0", "a0"] });
  });

  it("works when the stored positions have gaps", async () => {
    await pool.query("UPDATE cards SET position = position * 5 WHERE list_id = $1", [todo]);
    await moveCard(owner, { cardId: card.a2, listId: todo, position: 1 });
    expect(await boardOrder()).toEqual({ "To Do": ["a0", "a2", "a1"], Doing: ["b0"] });
    expect(await positionsAreClean()).toBe(true);
  });

  it("lets a board member move cards", async () => {
    const res = await moveCard(member, { cardId: card.a0, listId: doing, position: 1 });
    expect(res.status).toBe(200);
  });

  it("cannot move a card to a list on another board, even one the user owns", async () => {
    const otherBoard = (await pool.query("INSERT INTO boards (name, owner_id) VALUES ('Other', $1) RETURNING id", [owner.id])).rows[0].id;
    const otherList = (await pool.query("INSERT INTO lists (board_id, name) VALUES ($1, 'Elsewhere') RETURNING id", [otherBoard])).rows[0].id;

    const res = await moveCard(owner, { cardId: card.a0, listId: otherList, position: 0 });
    expect(res.status).toBe(404);
    expect(await boardOrder()).toEqual({ "To Do": ["a0", "a1", "a2"], Doing: ["b0"] });
  });

  it("does not let a stranger move a card", async () => {
    const res = await moveCard(stranger, { cardId: card.a0, listId: doing, position: 0 });
    expect(res.status).toBe(404);
    expect(await boardOrder()).toEqual({ "To Do": ["a0", "a1", "a2"], Doing: ["b0"] });
  });

  it("returns 404 for a card that doesn't exist", async () => {
    const res = await moveCard(owner, { cardId: 999999, listId: todo, position: 0 });
    expect(res.status).toBe(404);
  });

  it.each([
    ["missing position", { position: undefined }],
    ["a negative position", { position: -1 }],
    ["a fractional position", { position: 1.5 }],
    ["a string position", { position: "1" }],
    ["a bad cardId", { cardId: "abc" }],
    ["a bad listId", { listId: "abc" }],
  ])("returns 400 for %s", async (_label, change) => {
    const res = await moveCard(owner, { cardId: card.a0, listId: doing, position: 0, ...change });
    expect(res.status).toBe(400);
  });

  it("requires a token", async () => {
    const res = await request(app).post("/api/moveCard").send({ cardId: card.a0, listId: doing, position: 0 });
    expect(res.status).toBe(401);
  });
});
