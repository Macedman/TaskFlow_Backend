import pool from "../config/db";
import { Request, Response } from "express";

export const addTask = async (req: Request, res: Response) => {
    const { title, listId, userId } = req.body;

        if (!listId || !title) {
            res.status(400).json({ message: "listId, userId and title are required" });
            return;
        }
    try {

        // 1. create the card
        const query = `
        INSERT INTO cards (list_id, title, description, position, due_date)
      VALUES (
        $1,
        $2,
        '',
        COALESCE((SELECT MAX(position) + 1 FROM cards WHERE list_id = $1), 0),
        NULL
      )
      RETURNING *;
        `;
        const values = [listId, title];
        const { rows } = await pool.query(query, values);
        const newCard = rows[0];

        // 2.assign the card to the current user
        const insertAssigneeQuery = `
      INSERT INTO card_assignees (card_id, user_id)
      VALUES ($1, $2);
    `;
        const insertAssigneeValues = [newCard.id, req.body.userId];
        await pool.query(insertAssigneeQuery, insertAssigneeValues);

        res.status(201).json(newCard);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
}