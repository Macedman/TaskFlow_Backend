import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";
import { storage } from "../storage/storage";

// A plain <a href> can't send the login token, so the client asks here first:
// we check access once and hand back a link that only works for a few minutes
export const getAttachmentDownloadUrl = async (req: Request, res: Response) => {
    const { attachmentId } = req.body;
    const userId = getUserId(req);

    // isValidId also rejects a missing attachmentId
    if (!isValidId(attachmentId)) {
        res.status(400).json({ message: "attachmentId is required" });
        return;
    }
    try {
        const { rows } = await pool.query(
            `SELECT a.kind, a.name, a.storage_key
            FROM card_attachments a
            JOIN cards c ON a.card_id = c.id
            JOIN lists l ON c.list_id = l.id
            JOIN boards b ON l.board_id = b.id
            WHERE a.id = $2 AND ${BOARD_ACCESS_SQL}`,
            [userId, attachmentId]
        );
        if (rows.length === 0) {
            res.status(404).json({ message: "Attachment not found" });
            return;
        }
        if (rows[0].kind !== "pdf") {
            res.status(400).json({ message: "Only PDF attachments can be downloaded" });
            return;
        }

        res.status(200).json({ url: await storage.getDownloadUrl(rows[0].storage_key, rows[0].name) });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
