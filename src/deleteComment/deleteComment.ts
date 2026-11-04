import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";

export const deleteComment = async (req: Request, res: Response) => {
    const { commentId } = req.body;
    const userId = getUserId(req);

    // isValidId also rejects a missing commentId
    if (!isValidId(commentId)) {
        res.status(400).json({ message: "commentId is required" });
        return;
    }
    try {
        // the author or the board owner can delete, and only while they can access the board.
        // both checks are part of the DELETE, so no rows means not found, not allowed, or no access
        const { rows } = await pool.query(
            `DELETE FROM card_comments cc
            USING cards c, lists l, boards b
            WHERE cc.card_id = c.id
            AND c.list_id = l.id
            AND l.board_id = b.id
            AND cc.id = $2
            AND (cc.user_id = $1 OR b.owner_id = $1)
            AND ${BOARD_ACCESS_SQL}
            RETURNING cc.id;`,
            [userId, commentId]
        );
        if (rows.length === 0) {
            res.status(404).json({ message: "Comment not found" });
            return;
        }

        res.status(200).json({ comment_id: rows[0].id });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
