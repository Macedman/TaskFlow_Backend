import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";

// card_comments.body is TEXT, so this limit is ours, not the database's. updateComment uses it too
export const MAX_BODY_LENGTH = 5000;

export const addComment = async (req: Request, res: Response) => {
    const { cardId } = req.body;
    const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
    const userId = getUserId(req);

    // isValidId also rejects a missing cardId
    if (!isValidId(cardId) || !body) {
        res.status(400).json({ message: "cardId and body are required" });
        return;
    }
    if (body.length > MAX_BODY_LENGTH) {
        res.status(400).json({ message: `body must be ${MAX_BODY_LENGTH} characters or fewer` });
        return;
    }
    try {
        // the INSERT only selects a card the user can access, so no rows means not found or no access.
        // the outer SELECT adds the author's name so the client can show the comment as-is
        const { rows } = await pool.query(
            `WITH inserted AS (
                INSERT INTO card_comments (card_id, user_id, body)
                SELECT c.id, $1, $3
                FROM cards c
                JOIN lists l ON c.list_id = l.id
                JOIN boards b ON l.board_id = b.id
                WHERE c.id = $2 AND ${BOARD_ACCESS_SQL}
                RETURNING id, user_id, body, created_at, updated_at
            )
            SELECT i.id AS comment_id, i.body, i.created_at, i.updated_at, u.id AS user_id, u.full_name AS author_name
            FROM inserted i
            JOIN users u ON u.id = i.user_id;`,
            [userId, cardId, body]
        );
        if (rows.length === 0) {
            res.status(404).json({ message: "Card not found" });
            return;
        }

        res.status(201).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
