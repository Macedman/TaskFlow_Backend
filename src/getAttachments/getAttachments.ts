import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";

// The columns a client may see: attachment alias `a`, uploader alias `u`.
// storage_key is left out on purpose, so where a file is stored never reaches the browser
export const ATTACHMENT_COLUMNS = `a.id AS attachment_id, a.kind, a.name, a.url, a.size_bytes, a.created_at,
    u.id AS user_id, u.full_name AS author_name`;

export const getAttachments = async (req: Request, res: Response) => {
    const { cardId } = req.body;
    const userId = getUserId(req);

    // isValidId also rejects a missing cardId
    if (!isValidId(cardId)) {
        res.status(400).json({ message: "cardId is required" });
        return;
    }
    try {
        // checked separately so a card with no attachments ([]) isn't mistaken for no access (404)
        const access = await pool.query(
            `SELECT 1 FROM cards c
            JOIN lists l ON c.list_id = l.id
            JOIN boards b ON l.board_id = b.id
            WHERE c.id = $2 AND ${BOARD_ACCESS_SQL}`,
            [userId, cardId]
        );
        if (access.rows.length === 0) {
            res.status(404).json({ message: "Card not found" });
            return;
        }

        // newest first; id breaks a tie if two attachments share a timestamp
        const { rows } = await pool.query(
            `SELECT ${ATTACHMENT_COLUMNS}
            FROM card_attachments a
            JOIN users u ON u.id = a.user_id
            WHERE a.card_id = $1
            ORDER BY a.created_at DESC, a.id DESC;`,
            [cardId]
        );

        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
