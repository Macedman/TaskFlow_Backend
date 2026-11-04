import { existsSync } from "fs";
import path from "path";
import { Request, Response } from "express";
import { uploadsDir, verifyDownloadToken } from "../storage/storage";

// GET /api/files/:token, for files kept in the local folder (development).
// No login: the signed, short-lived token from getAttachmentDownloadUrl is the permission
export const downloadFile = (req: Request, res: Response) => {
    const download = verifyDownloadToken(String(req.params.token));
    const filePath = download && path.join(uploadsDir(), download.key);

    // a bad, expired or tampered token looks the same as a missing file
    if (!download || !filePath || !existsSync(filePath)) {
        res.status(404).json({ message: "File not found" });
        return;
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.attachment(download.name); // Content-Disposition: attachment, so the browser saves it
    res.type("application/pdf");
    res.sendFile(filePath);
}
