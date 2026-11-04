import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";
import { ATTACHMENT_COLUMNS } from "../getAttachments/getAttachments";

// Long enough for real links; url is TEXT, so this limit is ours
const MAX_URL_LENGTH = 2048;

// Returns the normalised link, or null for anything that isn't an http/https URL.
// Only those two are allowed so a "link" can never be javascript:, data: or a local file
const parseLink = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    try {
        const url = new URL(value.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        return url.href.length <= MAX_URL_LENGTH ? url.href : null;
    } catch {
        return null;
    }
}

export const addLinkAttachment = async (req: Request, res: Response) => {
    const { cardId } = req.body;
    const url = parseLink(req.body.url);
    const userId = getUserId(req);

    // isValidId also rejects a missing cardId
    if (!isValidId(cardId) || !url) {
        res.status(400).json({ message: "cardId and an http or https url are required" });
        return;
    }
    // display text is optional; blank counts as none
    if (req.body.name !== undefined && typeof req.body.name !== "string") {
        res.status(400).json({ message: "name must be a string" });
        return;
    }
    const name = req.body.name?.trim() || null;
    // card_attachments.name is VARCHAR(255); a longer value would make Postgres throw (500)
    if (name && name.length > 255) {
        res.status(400).json({ message: "name must be 255 characters or fewer" });
        return;
    }
    try {
        // the INSERT only selects a card the user can access, so no rows means not found or no access
        const { rows } = await pool.query(
            `WITH a AS (
                INSERT INTO card_attachments (card_id, user_id, kind, name, url)
                SELECT c.id, $1, 'link', $3, $4
                FROM cards c
                JOIN lists l ON c.list_id = l.id
                JOIN boards b ON l.board_id = b.id
                WHERE c.id = $2 AND ${BOARD_ACCESS_SQL}
                RETURNING *
            )
            SELECT ${ATTACHMENT_COLUMNS}
            FROM a
            JOIN users u ON u.id = a.user_id;`,
            [userId, cardId, name, url]
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
