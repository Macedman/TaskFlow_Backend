import { createHmac } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import jwt from "jsonwebtoken";

// Where attachment files live. Endpoints only use this interface, so the R2 version
// for deployment can replace the local one without changing them.
export interface FileStorage {
    save(key: string, data: Buffer): Promise<void>;
    remove(key: string): Promise<void>;
    // A short-lived link anyone holding it can use; callers check access before asking for one
    getDownloadUrl(key: string, fileName: string): Promise<string>;
}

const DOWNLOAD_LINK_SECONDS = 5 * 60;

// Keys are random names we generate (uuid + .pdf), never user input, so they can't escape the folder
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

export const uploadsDir = () => path.resolve(process.env.UPLOADS_DIR || "uploads");

// Development and tests: files in a local folder, served by GET /api/files/:token
const localFolderStorage: FileStorage = {
    async save(key, data) {
        await mkdir(uploadsDir(), { recursive: true });
        await writeFile(path.join(uploadsDir(), key), data);
    },
    async remove(key) {
        await rm(path.join(uploadsDir(), key), { force: true });
    },
    async getDownloadUrl(key, fileName) {
        const token = jwt.sign({ key, name: fileName }, downloadSecret(), { expiresIn: DOWNLOAD_LINK_SECONDS });
        // relative: the client resolves it against the API's address
        return `/api/files/${token}`;
    },
};

export const storage: FileStorage = localFolderStorage;
