import { Request, Response } from "express";
import { readFile, verifyDownloadToken } from "../storage/storage";

// GET /api/files/:token
// No login: the signed, short-lived token from getAttachmentDownloadUrl is the permission
export const downloadFile = async (req: Request, res: Response) => {
    const download = verifyDownloadToken(String(req.params.token));

    try {
        const data = download && await readFile(download.key);

        // a bad, expired or tampered token looks the same as a missing file
        if (!download || !data) {
            res.status(404).json({ message: "File not found" });
            return;
        }

        res.setHeader("X-Content-Type-Options", "nosniff");
        res.attachment(download.name); // Content-Disposition: attachment, so the browser saves it
        res.type("application/pdf");
        res.send(data);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
