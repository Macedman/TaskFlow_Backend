import { Request, Response } from "express";
import contentDisposition from "content-disposition";
import { readFile, verifyDownloadToken } from "../storage/storage";

// "résumé.pdf" -> "resume.pdf": accents dropped, anything else outside ASCII becomes "_"
const asciiFallback = (name: string) =>
    name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");

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
        // attachment, so the browser saves the file. Not res.attachment(): for names like
        // "résumé.pdf" it sends the raw é byte with no filename*, and browsers misread it.
        // A fallback that differs from the name makes the library add filename*=UTF-8''...
        res.setHeader("Content-Disposition", contentDisposition(download.name, { fallback: asciiFallback(download.name) }));
        res.type("application/pdf");
        res.send(data);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
}
