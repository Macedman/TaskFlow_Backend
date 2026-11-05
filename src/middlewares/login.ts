import { randomUUID } from "crypto";
import { Request, Response } from "express";
import pool from "../config/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { normalizeEmail } from "./signup";
dotenv.config();

// One answer for both an unknown email and a wrong password, so nobody can find out
// which emails have accounts
const INVALID_LOGIN = { message: "Invalid email or password" };

// Compared against when the email is unknown, so that answer takes as long as a wrong password
// (bcrypt is deliberately slow; skipping it would reveal the email doesn't exist)
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), 10);

export const login = async (req: Request, res: Response) => {
  const { password } = req.body;
  const email = normalizeEmail(req.body.email);

  // no length rules here: passwords made before the signup rules must still work
  if (!email || typeof password !== "string" || !password) {
    res.status(400).json({ message: "Email and Password is required" });
    return;
  }

  try {
    // lower() also matches accounts stored with capitals before emails were lowercased
    const result = await pool.query(
      `SELECT * FROM users WHERE lower(email) = $1 ORDER BY id LIMIT 1`,
      [email]
    );
    const user = result.rows[0];

    //Compare password and hashed password
    const match = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

    if (!user || !match) {
      res.status(401).json(INVALID_LOGIN);
      return;
    }

    //Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      },
    });
  } catch (error) {
    console.error("Login Error: ", error);
    res.status(500).json({ error: "Internal Server error" });
  }
};
