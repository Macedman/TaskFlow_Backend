import { Request, Response } from "express";
import pool from "../config/db";
import { getUserId } from "../middlewares/authMiddleware";

export const createBoard = async (req: Request, res: Response) => {

    // trimmed like addList, so "   " (or a non-string) can't become a board with no visible name
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const ownerId = getUserId(req);

    if (!name) {
        res.status(400).json({
            message: "Missing required fields."
        });
        return;
    }
    // boards.name is VARCHAR(255); a longer value would make Postgres throw (500)
    if (name.length > 255) {
        res.status(400).json({
            message: "name must be 255 characters or fewer"
        });
        return;
    }

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        // Create board
        const boardResult = await client.query(
            `
            INSERT INTO boards
            (
                name,
                owner_id
            )
            VALUES
            (
                $1,
                $2
            )
            RETURNING *
            `,
            [name, ownerId]
        );

        const board = boardResult.rows[0];

        await client.query("COMMIT");

        res.status(201).json({
            message: "Board created successfully.",
            board
        });

    } catch (error) {

        await client.query("ROLLBACK");

        console.error(error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    } finally {

        client.release();

    }

};