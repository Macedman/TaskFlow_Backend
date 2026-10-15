import { Request, Response } from "express";
import pool from "../config/db";

export const getBoards = async (req: Request, res: Response) => {
    const userId = req.body.userId;
    try {
        const boards = await pool.query(
            `
    SELECT
        id,
        name,
        owner_id,
        created_at,
        updated_at
    FROM boards
    WHERE owner_id = $1
    ORDER BY created_at DESC
    `,
            [userId]
        );
        res.status(200).json(boards.rows);
    }
    catch (error) {
        console.error("Error fetching boards:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}