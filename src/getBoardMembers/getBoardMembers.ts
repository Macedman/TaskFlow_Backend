import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { canAccessBoard } from "../middlewares/boardAccess";

// The owner lives in boards.owner_id, the others in board_members; one list with the owner first
export const MEMBERS_SQL = `
    SELECT u.id AS user_id, u.full_name, u.email, 'owner' AS role
    FROM boards b JOIN users u ON u.id = b.owner_id
    WHERE b.id = $1
    UNION ALL
    SELECT u.id, u.full_name, u.email, 'member'
    FROM board_members bm
    JOIN boards b ON b.id = bm.board_id
    JOIN users u ON u.id = bm.user_id
    WHERE bm.board_id = $1 AND bm.user_id <> b.owner_id
    ORDER BY role DESC, full_name, user_id`;

export const getBoardMembers = async (req: Request, res: Response) => {
    const { boardId } = req.body;
    const userId = getUserId(req);

    // isValidId also rejects a missing boardId
    if (!isValidId(boardId)) {
        res.status(400).json({ message: "boardId is required" });
        return;
    }
    try {
        // anyone on the board may see who else is on it
        if (!(await canAccessBoard(userId, boardId))) {
            res.status(404).json({ message: "Board not found" });
            return;
        }

        const { rows } = await pool.query(MEMBERS_SQL, [boardId]);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
