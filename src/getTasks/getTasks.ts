import { Request, Response } from "express";
import pool from "../config/db";

export const getTasks = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT 
    --b.id AS board_id,
    --b.name AS board_name,
    --l.id AS list_id,
    l.name AS list_name,
    --c.id AS card_id,
    c.title AS card_title
    --c.description,
    --c.position AS card_position
    --c.due_date,
    --c.created_at AS card_created_at
FROM card_assignees ca
JOIN cards c ON ca.card_id = c.id
JOIN lists l ON c.list_id = l.id
JOIN boards b ON l.board_id = b.id
WHERE ca.user_id = 1
ORDER BY b.id, l.position, c.position;`);
    const tasks = result.rows;
    //group tasks by list name
    const grouped = tasks.reduce((acc, card) => {
    if (!acc[card.list_name]) {
      acc[card.list_name] = [];  // Initialize the list group if it doesn't exist yet
      console.log('acc', acc);
      console.log('card', card);
    }

    acc[card.list_name].push(card.card_title); // Add the card to the appropriate group

    return acc;  // Return the updated accumulator for the next loop
  }, {});
    res.status(200).json(grouped);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};
