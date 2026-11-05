import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, pool, resetDatabase } from "./helpers";

beforeAll(async () => {
  await resetDatabase();
});
afterAll(() => pool.end());

const signup = (body: object) => request(app).post("/api/signup").send(body);
const login = (email: string, password: string) =>
  request(app).post("/api/login").send({ email, password });

const uniqueEmail = (name = "user") => `${name}-${randomUUID()}@example.test`;

describe("CORS", () => {
  it("lets the frontend's origin call the API", async () => {
    const res = await request(app).get("/").set("Origin", "http://localhost:4300");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:4300");
  });

  it("gives any other site no permission", async () => {
    const res = await request(app).get("/").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuses another site's preflight for an API call", async () => {
    const res = await request(app)
      .options("/api/getBoards")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("debug endpoints", () => {
  // unknown routes fall through to authMiddleware, so anonymous callers get 401 and logged-in ones 404
  it("no longer exposes GET /db", async () => {
    const anonymous = await request(app).get("/db");
    expect(anonymous.status).toBe(401);
    expect(anonymous.text).not.toContain("taskflow");

    const email = uniqueEmail("db");
    const password = randomUUID();
    await signup({ email, password, fullname: "Db" });
    const token = (await login(email, password)).body.token;
    const loggedIn = await request(app).get("/db").set("Authorization", `Bearer ${token}`);
    expect(loggedIn.status).toBe(404);
    expect(loggedIn.text).not.toContain("taskflow");
  });
});

describe("signup rules", () => {
  const valid = () => ({ email: uniqueEmail(), password: randomUUID(), fullname: "Sam" });

  it("accepts a valid signup", async () => {
    const res = await signup(valid());
    expect(res.status).toBe(200);
  });

  it.each([
    ["missing email", { email: undefined }],
    ["an email without @", { email: "not-an-email" }],
    ["an email with spaces inside", { email: "sam smith@example.test" }],
    ["an email over 100 characters", { email: `${"a".repeat(95)}@example.test` }],
    ["a non-string email", { email: 123 }],
    ["a blank name", { fullname: "   " }],
    ["a name over 100 characters", { fullname: "a".repeat(101) }],
    ["a password under 8 characters", { password: "1234567" }],
    // bcrypt ignores everything after 72 bytes, so a longer password would only look stronger
    ["a password over 72 bytes", { password: "a".repeat(73) }],
    ["a non-string password", { password: 12345678 }],
  ])("returns 400 for %s", async (_label, change) => {
    const res = await signup({ ...valid(), ...change });
    expect(res.status).toBe(400);
  });

  it("stores the email trimmed and lowercased", async () => {
    const email = uniqueEmail("Mixed.Case");
    const res = await signup({ ...valid(), email: `  ${email.toUpperCase()}  ` });
    expect(res.status).toBe(200);

    const { rows } = await pool.query("SELECT email FROM users WHERE lower(email) = lower($1)", [email]);
    expect(rows).toEqual([{ email: email.toLowerCase() }]);
  });

  it("treats the same email in different case as taken", async () => {
    const email = uniqueEmail("taken");
    await signup({ ...valid(), email });
    const res = await signup({ ...valid(), email: email.toUpperCase() });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email already taken");
  });
});

describe("login", () => {
  it("matches the email regardless of case and spaces", async () => {
    const email = uniqueEmail("login");
    const password = randomUUID();
    await signup({ email, password, fullname: "Sam" });

    expect((await login(email.toUpperCase(), password)).status).toBe(200);
    expect((await login(`  ${email}  `, password)).status).toBe(200);
  });

  it("still logs in a user whose email was stored with capitals before this change", async () => {
    const email = uniqueEmail("Legacy.User");
    const password = randomUUID();
    await signup({ email, password, fullname: "Legacy" });
    // simulate an account created before emails were lowercased: put the capitals back
    await pool.query("UPDATE users SET email = $1 WHERE email = $2", [email, email.toLowerCase()]);

    expect((await login(email.toLowerCase(), password)).status).toBe(200);
  });

  // different messages would tell anyone which emails have accounts
  it("gives the same answer for an unknown email and a wrong password", async () => {
    const email = uniqueEmail("known");
    await signup({ email, password: randomUUID(), fullname: "Known" });

    const unknown = await login(uniqueEmail("nobody"), "whatever-password");
    const wrong = await login(email, "whatever-password");
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("returns 400 for a non-string email", async () => {
    const res = await request(app).post("/api/login").send({ email: 123, password: "x" });
    expect(res.status).toBe(400);
  });
});
