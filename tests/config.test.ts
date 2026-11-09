import { describe, expect, it } from "vitest";
import { poolConfig } from "../src/config/db";
import { checkEnv } from "../src/config/checkEnv";

describe("poolConfig", () => {
  it("connects to Neon with its connection string, over verified SSL", () => {
    const url = "postgresql://user:pw@ep-example.neon.tech/taskflow?sslmode=require";

    expect(poolConfig({ DATABASE_URL: url, DB_NAME: "ignored" })).toEqual({
      connectionString: url,
      ssl: { rejectUnauthorized: true },
    });
  });

  it("uses the separate DB_* settings locally, without SSL", () => {
    expect(poolConfig({ DB_USER: "me", DB_HOST: "localhost", DB_NAME: "taskflow_test", DB_PASSWORD: "pw", DB_PORT: "5432" })).toEqual({
      user: "me",
      host: "localhost",
      database: "taskflow_test",
      password: "pw",
      port: 5432,
    });
  });

  it("treats an empty DATABASE_URL as not set (the tests force it empty)", () => {
    expect(poolConfig({ DATABASE_URL: "", DB_NAME: "taskflow_test" })).toMatchObject({ database: "taskflow_test" });
  });
});

describe("checkEnv", () => {
  const goodSecret = "x".repeat(32);

  it("accepts a JWT secret of at least 32 characters", () => {
    expect(() => checkEnv({ JWT_SECRET: goodSecret })).not.toThrow();
  });

  it("refuses to start without a JWT secret", () => {
    expect(() => checkEnv({})).toThrow("JWT_SECRET is not set");
  });

  it("refuses a short JWT secret, without ever showing it", () => {
    const short = "short-secret-123";
    let message = "";
    try {
      checkEnv({ JWT_SECRET: short });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("JWT_SECRET must be at least 32 characters");
    expect(message).not.toContain(short);
  });
});
