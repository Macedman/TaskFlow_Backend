import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
export interface AuthUser {
    userId: number;
    email: string;
}

export interface AuthRequest extends Request {
    user?: AuthUser;
}

// The logged-in user's id, taken from the verified JWT.
// Only call this behind authMiddleware.
export const getUserId = (req: Request): number => {
    return (req as AuthRequest).user!.userId;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeaders = req.headers.authorization;

    if (!authHeaders || !authHeaders.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    if (authHeaders) {
        const token = authHeaders.split(" ")[1];
    

        try {
            const secret = process.env.JWT_SECRET as string;
            const decoded = jwt.verify(token, secret);
            req.user = decoded as AuthUser;
            next();
        } catch (error) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }
    }
}