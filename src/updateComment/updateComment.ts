import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";
import { MAX_BODY_LENGTH } from "../addComment/addComment";

export const updateComment = async (req: Request, res: Response) => {
    const { commentId } = req.body;
    const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
    const userId = getUserId(req);

    // isValidId also rejects a missing commentId
    if (!isValidId(commentId) || !body) {
        res.status(400).json({ message: "commentId and body are required" });
        return;
    }
    if (body.length > MAX_BODY_LENGTH) {
        res.status(400).json({ message: `body must be ${MAX_BODY_LENGTH} characters or fewer` });
        return;
    }
    try {
        // only the author can edit, and only while they can still access the board.
        // both checks are part of the UPDATE, so no rows means not found, not the author, or no access
        const { rows } = await pool.query(
            `WITH updated AS (
                UPDATE card_comments cc
                SET body = $3, updated_at = CURRENT_TIMESTAMP
                FROM cards c
                JOIN lists l ON c.list_id = l.id
                JOIN boards b ON l.board_id = b.id
                WHERE cc.card_id = c.id
                AND cc.id = $2
                AND cc.user_id = $1
                AND ${BOARD_ACCESS_SQL}
                RETURNING cc.id, cc.user_id, cc.body, cc.created_at, cc.updated_at
            )
            SELECT up.id AS comment_id, up.body, up.created_at, up.updated_at, u.id AS user_id, u.full_name AS author_name
            FROM updated up
            JOIN users u ON u.id = up.user_id;`,
            [userId, commentId, body]
        );
        if (rows.length === 0) {
            res.status(404).json({ message: "Comment not found" });
            return;
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
