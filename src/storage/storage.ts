import { createHmac } from "crypto";
import { PoolClient } from "pg";
import jwt from "jsonwebtoken";
import pool from "../config/db";

// PDFs are kept in the database (attachment_files), so storage needs no extra service, account
// or card, and the file and its attachment row are saved and deleted together.
// Downloads go through GET /api/files/:token with a short-lived signed link.

const DOWNLOAD_LINK_SECONDS = 5 * 60;

// Keys are random names we generate (uuid + .pdf), never user input
export const isSafeKey = (key: unknown): key is string =>
    typeof key === "string" && /^[0-9a-f-]{36}\.pdf$/.test(key);

// A separate key from the login one, so a download token is never accepted as a login token
// (authMiddleware takes anything signed with JWT_SECRET) and a login token never opens a file
const downloadSecret = () =>
    createHmac("sha256", process.env.JWT_SECRET as string).update("file-download").digest("hex");

export interface DownloadToken {
    key: string;
    name: string;
}

export const verifyDownloadToken = (token: string): DownloadToken | null => {
    try {
        const payload = jwt.verify(token, downloadSecret()) as Partial<DownloadToken>;
        return isSafeKey(payload.key) && typeof payload.name === "string"
            ? { key: payload.key, name: payload.name }
            : null;
    } catch {
        return null; // tampered with, or expired
    }
}

// A link anyone holding it can use for a few minutes; callers check access before asking for one
export const getDownloadUrl = (key: string, fileName: string): string => {
    const token = jwt.sign({ key, name: fileName }, downloadSecret(), { expiresIn: DOWNLOAD_LINK_SECONDS });
    // relative: the client resolves it against the API's address
    return `/api/files/${token}`;
}

// Takes the upload's transaction client, so the file is saved only if its attachment row is
// (the foreign key also needs the row to exist first)
export const saveFile = async (client: PoolClient, key: string, data: Buffer) => {
    await client.query("INSERT INTO attachment_files (storage_key, data) VALUES ($1, $2)", [key, data]);
}

export const readFile = async (key: string): Promise<Buffer | null> => {
    const { rows } = await pool.query("SELECT data FROM attachment_files WHERE storage_key = $1", [key]);
    return rows[0]?.data ?? null;
}
