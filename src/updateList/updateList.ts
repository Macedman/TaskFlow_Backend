import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";

export const updateList = async (req: Request, res: Response) => {
    const { listId } = req.body;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const userId = getUserId(req);

    // a non-numeric listId would make Postgres throw (500)
    if (!Number.isInteger(Number(listId)) || !name) {
        res.status(400).json({ message: "listId and name are required" });
        return;
    }
    // lists.name is VARCHAR(255); a longer value would make Postgres throw (500)
    if (name.length > 255) {
        res.status(400).json({ message: "name must be 255 characters or fewer" });
        return;
    }
    try {
        // the access check is part of the UPDATE, so no rows means not found or no access
        const { rows } = await pool.query(
            `UPDATE lists l
            SET name = $3
            FROM boards b
            WHERE l.board_id = b.id
            AND l.id = $2
            AND ${BOARD_ACCESS_SQL}
            RETURNING l.id, l.name;`,
            [userId, listId, name]
        );
        if (rows.length === 0) {
            res.status(404).json({ message: "List not found" });
            return;
        }

        res.status(200).json({ listId: rows[0].id, listName: rows[0].name });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
