import { Request, Response } from "express";
import pool from "../config/db";

export const getTasks = async (req: Request, res: Response) => {
    try {
        const result = await pool.query("SELECT * FROM users");
        const users = result.rows;
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}