import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
interface AuthRequest extends Request {
    user?: any;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeaders = req.headers.authorization;

    if (!authHeaders || !authHeaders.startsWith("Bearer ")) {
        res.status(401).json({ message: "Unauthorized" });
    }

    if (authHeaders) {
        const token = authHeaders.split(" ")[1];
    

        try {
            const secret = process.env.JWT_SECRET as string;
            const decoded = jwt.verify(token, secret);
            req.user = decoded;
            next();
        } catch (error) {
            res.status(401).json({ message: "Invalid or expired token" });
        }
    }
}