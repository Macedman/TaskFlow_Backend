import pool from "../config/db";
import { Request, Response } from "express";
import { PoolClient } from "pg";
import { getUserId } from "../middlewares/authMiddleware";
import { isValidId } from "../middlewares/isValidId";
import { BOARD_ACCESS_SQL } from "../middlewares/boardAccess";

// Writes positions 0, 1, 2... in the given order, in one statement.
// WITH ORDINALITY numbers each id by its place in the array (starting at 1)
const writeOrder = (client: PoolClient, listId: number, cardIds: number[]) =>
    client.query(
        `UPDATE cards c
        SET list_id = $1, position = t.ord - 1
        FROM unnest($2::int[]) WITH ORDINALITY AS t(id, ord)
        WHERE c.id = t.id`,
        [listId, cardIds]
    );

const cardIdsInOrder = async (client: PoolClient, listId: number, exceptCardId?: number) =>
    (await client.query(
        `SELECT id FROM cards
        WHERE list_id = $1 AND id IS DISTINCT FROM $2
        ORDER BY position, id`,
        [listId, exceptCardId ?? null]
    )).rows.map(r => r.id as number);

export const moveCard = async (req: Request, res: Response) => {
    const { cardId, listId, position } = req.body;
    const userId = getUserId(req);

    // isValidId also rejects missing ids; position is the card's index in the target list
    if (!isValidId(cardId) || !isValidId(listId) || !Number.isInteger(position) || position < 0) {
        res.status(400).json({ message: "cardId, listId and a position of 0 or more are required" });
        return;
    }

    // several rows change together, so it's all or nothing
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. the card, on a board the user can access; locked so two moves of it can't interleave
        const cardResult = await client.query(
            `SELECT c.id, c.list_id, l.board_id
            FROM cards c
            JOIN lists l ON c.list_id = l.id
            JOIN boards b ON l.board_id = b.id
            WHERE c.id = $2 AND ${BOARD_ACCESS_SQL}
            FOR UPDATE OF c`,
            [userId, cardId]
        );
        if (cardResult.rows.length === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ message: "Card not found" });
            return;
        }
        const card = cardResult.rows[0];
        const fromListId: number = card.list_id;
        const toListId = Number(listId);

        // 2. the target list must be on the same board. Both lists are locked, in id order,
        //    so two moves between the same lists queue up instead of deadlocking
        const listResult = await client.query(
            `SELECT id FROM lists
            WHERE id = ANY($1::int[]) AND board_id = $2
            ORDER BY id
            FOR UPDATE`,
            [[fromListId, toListId], card.board_id]
        );
        if (!listResult.rows.some(r => r.id === toListId)) {
            await client.query("ROLLBACK");
            res.status(404).json({ message: "List not found" });
            return;
        }

        // 3. the target list's order without the card, with the card put back at its new index
        const targetOrder = await cardIdsInOrder(client, toListId, card.id);
        const index = Math.min(position, targetOrder.length); // past the end means last
        targetOrder.splice(index, 0, card.id);
        await writeOrder(client, toListId, targetOrder);

        // 4. close the gap in the list the card left
        if (fromListId !== toListId) {
            await writeOrder(client, fromListId, await cardIdsInOrder(client, fromListId));
        }

        await client.query("COMMIT");
        res.status(200).json({ card_id: card.id, list_id: toListId, position: index });
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(500).json({ message: "Internal server error" });
    } finally {
        client.release();
    }
}
