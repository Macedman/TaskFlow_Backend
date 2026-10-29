import { Request, Response } from "express";
import pool from "../config/db";
import { getUserId } from "../middlewares/authMiddleware";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";

export const getBoards = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    try {
        const boards = await pool.query(
            `
    SELECT
        b.id,
        b.name,
        b.owner_id,
        b.created_at,
        b.updated_at
    FROM boards b
    WHERE ${BOARD_ACCESS_SQL}
    ORDER BY b.created_at DESC
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