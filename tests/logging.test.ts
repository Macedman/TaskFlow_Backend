import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Everything the app writes to the console, captured instead of printed.
const logged: string[] = [];
const capture = (...args: unknown[]) => {
  logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
};

// Only report whether a secret leaked, never the secret itself, so a
// failing test can't print it either.
const leaked = (secret: string | undefined) =>
  !!secret && secret.length >= 4 && logged.some((line) => line.includes(secret));

let helpers: typeof import("./helpers");

beforeAll(async () => {
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(capture);
  }
  // Import after the spies are in place, so db.ts's startup logging is captured.
  helpers = await import("./helpers");
  await helpers.resetDatabase();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await helpers.pool.end();
});

describe("logging", () => {
  it("does not log the database password on startup", () => {
    expect(leaked(process.env.DB_PASSWORD), "DB_PASSWORD was logged").toBe(false);
  });

  it("does not log the user's password or the JWT secret on login", async () => {
    const email = `dana-${randomUUID()}@example.test`;
    const password = randomUUID();
    await request(helpers.app)
      .post("/api/signup")
      .send({ email, password, fullname: "dana" })
      .expect(200);
    await request(helpers.app).post("/api/login").send({ email, password }).expect(200);

    expect(leaked(password), "user's password was logged").toBe(false);
    expect(leaked(process.env.JWT_SECRET), "JWT_SECRET was logged").toBe(false);
  });
});
