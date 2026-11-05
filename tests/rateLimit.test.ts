import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
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
