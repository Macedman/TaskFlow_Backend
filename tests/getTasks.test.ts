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

const getTasks = (user: TestUser, boardId: number) =>
  request(app).post("/api/getTasks").set(as(user)).send({ boardId });

describe("getTasks", () => {
  it("returns a list that has no cards, with an empty cards array", async () => {
    const { rows } = await pool.query(
      "INSERT INTO lists (board_id, name, position) VALUES ($1, 'Done', 1) RETURNING id",
      [board.boardId]
    );

    const res = await getTasks(owner, board.boardId);
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual({
      listId: rows[0].id,
      listName: "Done",
      cards: [],
    });
  });

  it("returns cards on the board that are not assigned to the caller", async () => {
    await pool.query(
      "INSERT INTO cards (list_id, title, position) VALUES ($1, 'Unassigned task', 1)",
      [board.listId]
    );

    const res = await getTasks(owner, board.boardId);
    expect(res.status).toBe(200);
    const todo = res.body.find((l: any) => l.listId === board.listId);
    expect(todo.cards.map((c: any) => c.card_title)).toEqual([
      "Secret task",
      "Unassigned task",
    ]);
  });
});
