import pkg from "pg";
import dotenv from "dotenv";
const { Pool } = pkg;
dotenv.config();

type Env = Record<string, string | undefined>;

// Production (Neon) gives one connection string and requires SSL; rejectUnauthorized checks the
// server's certificate, so nobody in between can pose as the database. Locally (dev and tests)
// the separate DB_* settings are used, without SSL.
export const poolConfig = (env: Env): pkg.PoolConfig =>
  env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: true } }
    : {
        user: env.DB_USER,
        host: env.DB_HOST,
        database: env.DB_NAME,
        password: env.DB_PASSWORD,
        port: Number(env.DB_PORT),
      };

const pool = new Pool(poolConfig(process.env));

export default pool;
