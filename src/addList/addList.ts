import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { canAccessBoard } from "../middlewares/boardAccess";

export const addList = async (req: Request, res: Response) => {
    const { boardId } = req.body;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const userId = getUserId(req);

    // Number.isInteger also rejects a missing boardId; a non-numeric one would make Postgres throw (500)
    if (!Number.isInteger(Number(boardId)) || !name) {
        res.status(400).json({ message: "boardId and name are required" });
        return;
    }
    try {
        // 0. make sure the board is one the user can access
        if (!(await canAccessBoard(userId, boardId))) {
            res.status(404).json({ message: "Board not found" });
            return;
        }

        // 1. create the list at the end of the board
        const { rows } = await pool.query(
            `INSERT INTO lists (board_id, name, position)
            VALUES (
                $1,
                $2,
                COALESCE((SELECT MAX(position) + 1 FROM lists WHERE board_id = $1), 0)
            )
            RETURNING id, name;`,
            [boardId, name]
        );

        // same shape as a getTasks list, so the client can add it to the board as-is
        res.status(201).json({ listId: rows[0].id, listName: rows[0].name, cards: [] });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
