import { Request, Response } from "express";
import pool from "../config/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export const login = async (req: Request, res: Response) => {
  console.log(req.body);
  console.log(process.env.JWT_SECRET);

  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: "Email and Password is required" });
  }

  try {
    const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [
      email,
    ]);
    const user = result.rows[0];

    if (!user) {
      res.status(401).json({ message: "User does not exist" });
    }

    //Compare password and hashed password
    const match = await bcrypt.compare(password, user.password_hash);

    console.log(match);

    if (!match) {
      res.status(401).json({ message: "Password is incorrect" });
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
    console.log("Login Error: ", error);
    res.status(500).json({ error: "Internal Server error" });
  }
};
