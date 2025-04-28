import bcrypt from "bcrypt"
import pool from "../config/db"
import express, { Request, Response } from "express"

export const signup = async (req : Request, res : Response) => {
    const { email, password, fullname } = req.body;

    if (!email || !fullname || !password) {
        res.status(400).json({ message: "Missing required fields"});
    }

    try {
        //1. Check if user already exist
        const existingUser = await pool.query(
            `SELECT * FROM users WHERE email = $1`,
            [email]
        );

        if  (existingUser.rows.length > 0) {
            res.status(400).json({message: "Email already taken"});
        }

        //2. Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        //3. Insert new user into DB
        await pool.query(
            `INSERT INTO users (email, full_name, password_hash)
            VALUES ($1, $2, $3)`,
            [email, fullname, hashedPassword || null]
        )

        res.status(200).json({message: "User created successfully! "})
    }

    catch (error) {
        console.log('Signup Error: ', error)
        res.status(500).json({message: "Internal Server Error"})
    }
}