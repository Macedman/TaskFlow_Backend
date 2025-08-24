import pool from "../config/db";
import { Request, Response } from "express";

export const getTaskDetails = async (req: Request, res: Response)  => {
    const cardId = req.body.cardId;
    try {
        const result = await pool.query(`SELECT 
    c.id AS card_id,
    c.title AS card_title,
    c.description,
    c.position,
    c.due_date,
    c.created_at,
    l.id AS list_id,
    l.name AS list_name,
    b.id AS board_id,
    b.name AS board_name
FROM 
    cards c
JOIN 
    lists l ON c.list_id = l.id
JOIN 
    boards b ON l.board_id = b.id
WHERE 
    c.id = $1`, [cardId]);

    res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching task details:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}