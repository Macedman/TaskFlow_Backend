import bcrypt from "bcrypt"
import pool from "../config/db"
import { Request, Response } from "express"

// users.email and users.full_name are VARCHAR(100); longer values would make Postgres throw (500)
const MAX_EMAIL_LENGTH = 100;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes; anything after that would be silently ignored
const MAX_PASSWORD_BYTES = 72;

// Trimmed and lowercased so "Sam@X.com " and "sam@x.com" are one account. Null if it can't be an email.
// Login uses this too, so both sides compare emails the same way
export const normalizeEmail = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const email = value.trim().toLowerCase();
    return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export const signup = async (req : Request, res : Response) => {
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);
    const fullname = typeof req.body.fullname === "string" ? req.body.fullname.trim() : "";

    if (!email) {
        return res.status(400).json({ message: "A valid email is required" });
    }
    if (!fullname || fullname.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ message: `Name must be 1 to ${MAX_NAME_LENGTH} characters` });
    }
    if (typeof password !== "string"
        || password.length < MIN_PASSWORD_LENGTH
        || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
        return res.status(400).json({ message: `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_BYTES} characters` });
    }

    try {
        //1. Check if user already exist (in any letter case, for accounts made before emails were lowercased)
        const existingUser = await pool.query(
            `SELECT 1 FROM users WHERE lower(email) = $1`,
            [email]
        );

        if  (existingUser.rows.length > 0) {
            return res.status(400).json({message: "Email already taken"});
        }

        //2. Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        //3. Insert new user into DB
        await pool.query(
            `INSERT INTO users (email, full_name, password_hash)
            VALUES ($1, $2, $3)`,
            [email, fullname, hashedPassword]
        )

        res.status(200).json({message: "User created successfully! "})
    }

    catch (error) {
        // two signups with the same email at the same moment: the UNIQUE constraint stops the second
        if ((error as { code?: string }).code === "23505") {
            return res.status(400).json({ message: "Email already taken" });
        }
        console.error('Signup Error: ', error)
        res.status(500).json({message: "Internal Server Error"})
    }
}
