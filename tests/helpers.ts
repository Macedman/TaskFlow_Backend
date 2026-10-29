import { randomUUID } from "crypto";
import request from "supertest";
import app from "../src/app";
import pool from "../src/config/db";

export { app, pool };

export interface TestUser {
  id: number;
  email: string;
  token: string;
}

export async function resetDatabase() {
  const { rows } = await pool.query("SELECT current_database() AS name");
  // Guard against ever wiping the real dev database.
  if (rows[0].name !== "taskflow_test") {
    throw new Error(`Refusing to reset database "${rows[0].name}"`);
  }
  await pool.query(
    "TRUNCATE card_assignees, board_members, cards, lists, boards, users RESTART IDENTITY CASCADE"
  );
}

// Signs up and logs in a fresh user with a generated password.
export async function createUser(name: string): Promise<TestUser> {
  const email = `${name}-${randomUUID()}@example.test`;
  const password = randomUUID();

  await request(app)
    .post("/api/signup")
    .send({ email, password, fullname: name })
    .expect(200);

  const res = await request(app)
    .post("/api/login")
    .send({ email, password })
    .expect(200);

  return { id: res.body.user.id, email, token: res.body.token };
}

// Creates a board with one list and one card assigned to the owner.
export async function createBoardWithCard(owner: TestUser) {
  const board = await pool.query(
    "INSERT INTO boards (name, owner_id) VALUES ($1, $2) RETURNING id",
    ["Private board", owner.id]
  );
  const list = await pool.query(
    "INSERT INTO lists (board_id, name, position) VALUES ($1, 'To Do', 0) RETURNING id",
    [board.rows[0].id]
  );
  const card = await pool.query(
    "INSERT INTO cards (list_id, title, position) VALUES ($1, 'Secret task', 0) RETURNING id",
    [list.rows[0].id]
  );
  await pool.query(
    "INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2)",
    [card.rows[0].id, owner.id]
  );
  return {
    boardId: board.rows[0].id as number,
    listId: list.rows[0].id as number,
    cardId: card.rows[0].id as number,
  };
}
