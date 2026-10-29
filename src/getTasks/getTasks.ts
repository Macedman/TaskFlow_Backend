import { Request, Response } from "express";
import pool from "../config/db";
import { getUserId } from "../middlewares/authMiddleware";
import { canAccessBoard } from "../middlewares/boardAccess";

export const getTasks = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const boardId = req.body.boardId;
  console.log('userId', userId);
  try {
    if (!(await canAccessBoard(userId, boardId))) {
      res.status(404).json({ message: "Board not found" });
      return;
    }

    const result = await pool.query(
    `SELECT
    l.id AS list_id,
    l.name AS list_name,
    c.id AS card_id,
    c.title AS card_title
FROM lists l
LEFT JOIN cards c ON c.list_id = l.id
WHERE l.board_id = $1
ORDER BY l.position, c.position;`, [boardId]);
    const tasks = result.rows;
    //group tasks by list name  
    const grouped = tasks.reduce((acc, card) => {
      //change to list_id instead of list_name to avoid issues with duplicate list names
    if (!acc[card.list_id]) {
      acc[card.list_id] = {
        listId: card.list_id,
        listName: card.list_name,
        cards: []
      };  // Initialize the list group if it doesn't exist yet
    }

    // An empty list comes back as one row with a NULL card; keep it as cards: []
    if (card.card_id !== null) acc[card.list_id].cards.push({
      card_id: card.card_id,
      card_title: card.card_title}); // Add the card to the appropriate group

    return acc;  // Return the updated accumulator for the next loop
  }, {});
    const lists = Object.values(grouped); // Convert the grouped object into an array of lists
    res.status(200).json(lists);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};
