import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app, createUser, pool, resetDatabase } from "./helpers";

beforeAll(resetDatabase);
afterEach(() => vi.restoreAllMocks());
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

  // Over HTTP the client only ever sees the first response, so these tests
  // spy on what the handler does after sending an error.
  it("stops after rejecting a login with missing fields", async () => {
    const query = vi.spyOn(pool, "query");
    const res = await request(app).post("/api/login").send({ email: "" });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("stops after rejecting an unknown email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await request(app)
      .post("/api/login")
      .send({ email: "nobody@example.test", password: "whatever" });
    expect(res.status).toBe(401);
    expect(log).not.toHaveBeenCalledWith("Login Error: ", expect.anything());
  });

  it("never creates a token for a wrong password", async () => {
    const user = await createUser("carol");
    const sign = vi.spyOn(jwt, "sign");
    const res = await request(app)
      .post("/api/login")
      .send({ email: user.email, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(sign).not.toHaveBeenCalled();
  });

  it("rejects protected routes without a token", async () => {
    const res = await request(app).post("/api/getBoards").send({});
    expect(res.status).toBe(401);
  });
});
