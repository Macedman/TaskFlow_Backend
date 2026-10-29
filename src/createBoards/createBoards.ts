import { Request, Response } from "express";
import pool from "../config/db";
import { getUserId } from "../middlewares/authMiddleware";

export const createBoard = async (req: Request, res: Response) => {

    const { name } = req.body;
    const ownerId = getUserId(req);

    if (!name) {
        res.status(400).json({
            message: "Missing required fields."
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