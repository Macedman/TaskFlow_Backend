import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";

export const updateCard = async (req: Request, res: Response) => {
    const { cardId, description } = req.body;
    const title = typeof req.body.title === "string" ? req.body.title.trim() : req.body.title;
    const userId = getUserId(req);

    // a non-numeric cardId would make Postgres throw (500)
    if (!Number.isInteger(Number(cardId))) {
        res.status(400).json({ message: "cardId is required" });
        return;
    }
    if (title === undefined && description === undefined) {
        res.status(400).json({ message: "title or description is required" });
        return;
    }
    // cards.title is VARCHAR(255); a longer value would make Postgres throw (500)
    if (title !== undefined && (typeof title !== "string" || !title || title.length > 255)) {
        res.status(400).json({ message: "title must be 1 to 255 characters" });
        return;
    }
    // an empty description is allowed: that's how a description gets cleared
    if (description !== undefined && typeof description !== "string") {
        res.status(400).json({ message: "description must be a string" });
        return;
    }
    try {
        // a field that wasn't sent is NULL here, so COALESCE keeps its current value.
        // the access check is part of the UPDATE, so no rows means not found or no access
        const { rows } = await pool.query(
            `UPDATE cards c
            SET title = COALESCE($3, c.title),
                description = COALESCE($4, c.description)
            FROM lists l
            JOIN boards b ON l.board_id = b.id
            WHERE c.list_id = l.id
            AND c.id = $2
            AND ${BOARD_ACCESS_SQL}
            RETURNING c.id, c.title, c.description;`,
            [userId, cardId, title ?? null, description ?? null]
        );
        if (rows.length === 0) {
            res.status(404).json({ message: "Card not found" });
            return;
        }

        // same field names as getTaskDetails, so the modal can use them directly
        res.status(200).json({
            card_id: rows[0].id,
            card_title: rows[0].title,
            description: rows[0].description,
        });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
