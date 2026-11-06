import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";

export const deleteAttachment = async (req: Request, res: Response) => {
    const { attachmentId } = req.body;
    const userId = getUserId(req);

    // isValidId also rejects a missing attachmentId
    if (!isValidId(attachmentId)) {
        res.status(400).json({ message: "attachmentId is required" });
        return;
    }
    try {
        // the uploader or the board owner can delete, and only while they can access the board.
        // both checks are part of the DELETE, so no rows means not found, not allowed, or no access
        const { rows } = await pool.query(
            `DELETE FROM card_attachments a
            USING cards c, lists l, boards b
            WHERE a.card_id = c.id
            AND c.list_id = l.id
            AND l.board_id = b.id
            AND a.id = $2
            AND (a.user_id = $1 OR b.owner_id = $1)
            AND ${BOARD_ACCESS_SQL}
            RETURNING a.id;`,
            [userId, attachmentId]
        );
        if (rows.length === 0) {
            res.status(404).json({ message: "Attachment not found" });
            return;
        }

        // a PDF's file went with the row: attachment_files cascades on delete
        res.status(200).json({ attachment_id: rows[0].id });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
