import pool from "../config/db";

// SQL condition: board alias `b` is owned by, or shared with, user $1.
export const BOARD_ACCESS_SQL = `(
    b.owner_id = $1
    OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = b.id AND bm.user_id = $1
    )
)`;

export const canAccessBoard = async (userId: number, boardId: number | string): Promise<boolean> => {
    const result = await pool.query(
        `SELECT 1 FROM boards b WHERE b.id = $2 AND ${BOARD_ACCESS_SQL}`,
        [userId, boardId]
    );
    return result.rows.length > 0;
}
