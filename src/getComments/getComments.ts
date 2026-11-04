import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";

export const getComments = async (req: Request, res: Response) => {
    const { cardId } = req.body;
    const userId = getUserId(req);

    // isValidId also rejects a missing cardId
    if (!isValidId(cardId)) {
        res.status(400).json({ message: "cardId is required" });
        return;
    }
    try {
        // checked separately so a card with no comments ([]) isn't mistaken for no access (404)
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

        // newest first; id breaks a tie if two comments share a timestamp
        const { rows } = await pool.query(
            `SELECT cc.id AS comment_id, cc.body, cc.created_at, cc.updated_at, u.id AS user_id, u.full_name AS author_name
            FROM card_comments cc
            JOIN users u ON u.id = cc.user_id
            WHERE cc.card_id = $1
            ORDER BY cc.created_at DESC, cc.id DESC;`,
            [cardId]
        );

        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
