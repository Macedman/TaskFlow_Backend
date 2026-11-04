import { randomUUID } from "crypto";
import multer from "multer";
import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";
import { ATTACHMENT_COLUMNS } from "../getAttachments/getAttachments";
import { storage } from "../storage/storage";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

// Every PDF starts with these bytes. The file name and the browser's content type are easy to fake;
// the first bytes are what the file really is
const PDF_SIGNATURE = Buffer.from("%PDF-");

// Keeps the upload in memory and stops reading at 10 MB. utf8 so names like "résumé.pdf" survive
const receiveOnePdf = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PDF_BYTES, files: 1 },
    defParamCharset: "utf8",
}).single("file");

const readUpload = (req: Request, res: Response) =>
    new Promise<void>((resolve, reject) => receiveOnePdf(req, res, err => (err ? reject(err) : resolve())));

// Only the last part of the name, so "../../evil.pdf" is shown as "evil.pdf"; it's display text only
const displayName = (originalName: string) =>
    (originalName.split(/[\\/]/).pop() ?? "").trim().slice(0, 255) || "file.pdf";

export const uploadPdfAttachment = async (req: Request, res: Response) => {
    try {
        await readUpload(req, res);
    } catch (error) {
        const tooBig = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
        res.status(tooBig ? 413 : 400).json({ message: tooBig ? "PDF must be 10 MB or smaller" : "Invalid upload" });
        return;
    }

    const { cardId } = req.body ?? {};
    const file = req.file;
    const userId = getUserId(req);

    // isValidId also rejects a missing cardId
    if (!isValidId(cardId) || !file) {
        res.status(400).json({ message: "cardId and a file are required" });
        return;
    }
    if (!file.buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
        res.status(400).json({ message: "Only PDF files can be uploaded" });
        return;
    }

    try {
        // checked before saving, so someone without access can't write files to our storage
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

        // a name we generate, never the user's, so it can't point outside the uploads folder
        const key = `${randomUUID()}.pdf`;
        await storage.save(key, file.buffer);

        try {
            const { rows } = await pool.query(
                `WITH a AS (
                    INSERT INTO card_attachments (card_id, user_id, kind, name, storage_key, size_bytes)
                    VALUES ($1, $2, 'pdf', $3, $4, $5)
                    RETURNING *
                )
                SELECT ${ATTACHMENT_COLUMNS}
                FROM a
                JOIN users u ON u.id = a.user_id;`,
                [cardId, userId, displayName(file.originalname), key, file.size]
            );
            res.status(201).json(rows[0]);
        } catch (error) {
            // no row points at the file, so don't keep it
            await storage.remove(key);
            throw error;
        }
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
