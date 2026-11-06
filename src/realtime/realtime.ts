import { Server as HttpServer } from "http";
import { Request } from "express";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AuthUser } from "../middlewares/authMiddleware";
import { canAccessBoard } from "../middlewares/boardAccess";
import { isValidId } from "../middlewares/isValidId";
import { allowedOrigins } from "../config/cors";

dotenv.config();

// The socket only says "this board changed"; clients then re-fetch it over the REST API,
// which does every write and every access check. So no card data ever goes over the socket
let io: Server | undefined;

const room = (boardId: number | string) => `board:${Number(boardId)}`;

export const attachRealtime = (server: HttpServer) => {
    io = new Server(server, { cors: { origin: allowedOrigins } });

    // same check as authMiddleware: the JWT is sent once, when the socket connects
    io.use((socket, next) => {
        try {
            const secret = process.env.JWT_SECRET as string;
            socket.data.user = jwt.verify(socket.handshake.auth?.token, secret) as AuthUser;
            next();
        } catch (error) {
            next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        // only users who can open the board may hear about it
        socket.on("joinBoard", async (boardId, ack) => {
            let ok = false;
            try {
                ok = isValidId(boardId) && await canAccessBoard(socket.data.user.userId, boardId);
            } catch (error) {
                ok = false;
            }
            if (ok) socket.join(room(boardId));
            if (typeof ack === "function") ack({ ok });
        });

        socket.on("leaveBoard", (boardId) => {
            if (isValidId(boardId)) socket.leave(room(boardId));
        });
    });

    return io;
}

// Call after a write has been saved. The tab that made the change sends its socket id
// in X-Socket-Id and is skipped: it already shows the change
export const notifyBoardChanged = (boardId: number | string, req: Request) => {
    if (!io) return; // no socket server, e.g. tests that only use the Express app
    const sender = req.get("X-Socket-Id");
    const target = sender ? io.to(room(boardId)).except(sender) : io.to(room(boardId));
    target.emit("board:changed", { boardId: Number(boardId) });
}

// Call after a member has been removed: their open tabs leave the room, so they stop hearing
// about the board, and are told why, so the page can send them back to the dashboard
export const removeFromBoard = async (boardId: number | string, userId: number) => {
    if (!io) return;
    for (const socket of await io.in(room(boardId)).fetchSockets()) {
        if (socket.data.user?.userId === userId) {
            socket.leave(room(boardId));
            socket.emit("board:removed", { boardId: Number(boardId) });
        }
    }
}

export const closeRealtime = async () => {
    await io?.close();
    io = undefined;
}
