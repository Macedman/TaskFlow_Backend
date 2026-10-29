import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, createUser, pool, resetDatabase } from "./helpers";

beforeAll(resetDatabase);
afterAll(() => pool.end());

describe("auth", () => {
  it("signs up and logs in a user", async () => {
    const user = await createUser("alice");
    expect(user.token).toBeTruthy();
  });

  it("rejects login for an unknown email", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: "nobody@example.test", password: "whatever" });
    expect(res.status).toBe(401);
  });

  it("rejects login with the wrong password", async () => {
    const user = await createUser("bob");
    const res = await request(app)
      .post("/api/login")
      .send({ email: user.email, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it("rejects protected routes without a token", async () => {
    const res = await request(app).post("/api/getBoards").send({});
    expect(res.status).toBe(401);
  });
});
