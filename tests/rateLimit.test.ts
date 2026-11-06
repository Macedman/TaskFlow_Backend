import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app, pool, resetDatabase } from "./helpers";

// Kept in its own file: each test file gets a fresh app, so these counters start empty
// and other tests' logins and signups can't use up the limits.

const email = `limited-${randomUUID()}@example.test`;
const password = randomUUID();

beforeAll(async () => {
  await resetDatabase();
  await request(app).post("/api/signup").send({ email, password, fullname: "Limited" }).expect(200);
});
afterAll(() => pool.end());

const login = (pw: string) => request(app).post("/api/login").send({ email, password: pw });

describe("login rate limit", () => {
  it("does not count successful logins", async () => {
    for (let i = 0; i < 15; i++) {
      expect((await login(password)).status).toBe(200);
    }
  });

  it("blocks the 11th failed login in a row, even with the right password", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await login("wrong-password")).status).toBe(401);
    }
    const blocked = await login(password);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/too many/i);
  });
});

describe("signup rate limit", () => {
  it("blocks signups after 20 from the same address", async () => {
    // one signup already happened in beforeAll
    for (let i = 0; i < 19; i++) {
      const res = await request(app)
        .post("/api/signup")
        .send({ email: `spam-${i}-${randomUUID()}@example.test`, password, fullname: "Spam" });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app)
      .post("/api/signup")
      .send({ email: `spam-last-${randomUUID()}@example.test`, password, fullname: "Spam" });
    expect(blocked.status).toBe(429);
  });
});

describe("invite rate limit", () => {
  // signups are already used up above, so these accounts are inserted directly;
  // the password hash is never checked because nobody logs in with it
  const account = async (name: string) => {
    const email = `${name}-${randomUUID()}@example.test`;
    const { rows } = await pool.query(
      "INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, 'unused') RETURNING id", [name, email]
    );
    return { id: rows[0].id as number, email, token: jwt.sign({ userId: rows[0].id, email }, process.env.JWT_SECRET as string) };
  };

  it("blocks the 21st failed invite, but invites that work never count", async () => {
    const owner = await account("inviter");
    const boardId = (await pool.query("INSERT INTO boards (name, owner_id) VALUES ('Invites', $1) RETURNING id", [owner.id])).rows[0].id;
    const invite = (email: string) =>
      request(app).post("/api/addBoardMember").set("Authorization", `Bearer ${owner.token}`).send({ boardId, email });

    for (let i = 0; i < 5; i++) {
      expect((await invite((await account(`friend${i}`)).email)).status).toBe(201);
    }
    for (let i = 0; i < 20; i++) {
      expect((await invite(`guess-${i}-${randomUUID()}@example.test`)).status).toBe(404);
    }
    const blocked = await invite((await account("late-friend")).email);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/too many/i);
  });
});
