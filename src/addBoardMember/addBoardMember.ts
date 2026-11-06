import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { boardOwnerFor } from "../middlewares/boardAccess";
import { normalizeEmail } from "../middlewares/signup";

export const addBoardMember = async (req: Request, res: Response) => {
    const { boardId } = req.body;
    // the same rules as signup and login, so "Sam@X.com " finds sam@x.com
    const email = normalizeEmail(req.body.email);
    const userId = getUserId(req);

    if (!isValidId(boardId) || !email) {
        res.status(400).json({ message: "boardId and a valid email are required" });
        return;
    }
    try {
        // outsiders get 404 before anything about the email is checked, so they learn nothing
        const ownerId = await boardOwnerFor(userId, boardId);
        if (ownerId === null) {
            res.status(404).json({ message: "Board not found" });
            return;
        }
        if (ownerId !== userId) {
            res.status(403).json({ message: "Only the board owner can invite people" });
            return;
        }

        // only existing accounts can be added; there are no pending invites.
        // this does tell the owner whether an email has an account, which is why
        // failed invites are rate limited (inviteLimiter)
        const found = await pool.query(
            `SELECT id, full_name, email FROM users WHERE lower(email) = $1 ORDER BY id LIMIT 1`,
            [email]
        );
        const invitee = found.rows[0];
        if (!invitee) {
            res.status(404).json({ message: "No account with that email" });
            return;
        }
        if (invitee.id === ownerId) {
            res.status(409).json({ message: "You already own this board" });
            return;
        }

        // the primary key (board_id, user_id) makes a second invite a no-op instead of an error
        const inserted = await pool.query(
            `INSERT INTO board_members (board_id, user_id, role)
            VALUES ($1, $2, 'member')
            ON CONFLICT (board_id, user_id) DO NOTHING
            RETURNING user_id`,
            [boardId, invitee.id]
        );
        if (inserted.rows.length === 0) {
            res.status(409).json({ message: "That person is already on this board" });
            return;
        }

        // same shape as a getBoardMembers row, so the client can add it to the list as-is
        res.status(201).json({ user_id: invitee.id, full_name: invitee.full_name, email: invitee.email, role: "member" });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
