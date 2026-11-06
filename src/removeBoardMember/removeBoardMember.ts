import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { boardOwnerFor } from "../middlewares/boardAccess";
import { removeFromBoard } from "../realtime/realtime";

export const removeBoardMember = async (req: Request, res: Response) => {
    // memberId, not userId: in this API userId always means the caller, taken from the JWT
    const { boardId, memberId } = req.body;
    const userId = getUserId(req);

    if (!isValidId(boardId) || !isValidId(memberId)) {
        res.status(400).json({ message: "boardId and memberId are required" });
        return;
    }
    try {
        const ownerId = await boardOwnerFor(userId, boardId);
        if (ownerId === null) {
            res.status(404).json({ message: "Board not found" });
            return;
        }
        if (ownerId !== userId) {
            res.status(403).json({ message: "Only the board owner can remove people" });
            return;
        }

        // the owner has no board_members row, so they can't be removed from their own board
        const { rows } = await pool.query(
            `DELETE FROM board_members WHERE board_id = $1 AND user_id = $2 RETURNING user_id`,
            [boardId, memberId]
        );
        if (rows.length === 0) {
            res.status(404).json({ message: "Member not found" });
            return;
        }

        res.status(200).json({ user_id: rows[0].user_id });
        // their access is already gone; also stop their open tabs hearing about the board
        await removeFromBoard(boardId, rows[0].user_id);
    } catch (error) {
        if (!res.headersSent) res.status(500).json({ message: "Internal server error" });
    }
}
