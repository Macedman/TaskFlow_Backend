import pool from "../config/db";
import { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";

export const addTask = async (req: Request, res: Response) => {
    const { listId } = req.body;
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const userId = getUserId(req);

        // an id Postgres can't read as INTEGER would make it throw (500)
        if (!isValidId(listId) || !title) {
            res.status(400).json({ message: "listId and title are required" });
            return;
        }
        // cards.title is VARCHAR(255); a longer value would make Postgres throw (500)
        if (title.length > 255) {
            res.status(400).json({ message: "title must be 255 characters or fewer" });
            return;
        }

    // the card and its assignee are saved together or not at all
    const client = await pool.connect();
    try {
        // 0. make sure the list is on a board the user can access
        const access = await client.query(
            `SELECT 1 FROM lists l
            JOIN boards b ON l.board_id = b.id
            WHERE l.id = $2 AND ${BOARD_ACCESS_SQL}`,
            [userId, listId]
        );
        if (access.rows.length === 0) {
            res.status(404).json({ message: "List not found" });
            return;
        }

        await client.query("BEGIN");

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
        const { rows } = await client.query(query, values);
        const newCard = rows[0];

        // 2.assign the card to the current user
        const insertAssigneeQuery = `
      INSERT INTO card_assignees (card_id, user_id)
      VALUES ($1, $2);
    `;
        const insertAssigneeValues = [newCard.id, userId];
        await client.query(insertAssigneeQuery, insertAssigneeValues);

        await client.query("COMMIT");

        res.status(201).json(newCard);
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: "Internal server error" });
    } finally {
        client.release();
    }
}