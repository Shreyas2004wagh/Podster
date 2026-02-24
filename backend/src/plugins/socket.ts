import fp from "fastify-plugin";
import { Server, Socket } from "socket.io";
import { env } from "../config/env.js";
import { SessionRole } from "../models/session.js";

type TokenPayload = {
    sub: string;
    role: SessionRole;
};

type SocketUser = {
    sub: string;
    role: SessionRole;
};

type SocketSessionData = {
    user?: SocketUser;
    sessionId?: string;
};

declare module "fastify" {
    interface FastifyInstance {
        io: Server;
    }
}

interface SignalingPayload {
    to: string; // socket ID of target
    [key: string]: unknown;
}

export default fp(async (fastify) => {
    const io = new Server(fastify.server, {
        cors: {
            origin: env.FRONTEND_ORIGIN,
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    fastify.decorate("io", io);

    fastify.addHook("onClose", async () => {
        await io.close();
    });

    fastify.io.use(async (socket, next) => {
        try {
            const headerCookie = socket.handshake.headers.cookie;
            const parsedCookies = headerCookie ? fastify.parseCookie(headerCookie) : {};
            const queryToken = socket.handshake.query?.token;
            const token =
                socket.handshake.auth?.token ||
                (Array.isArray(queryToken) ? queryToken[0] : queryToken) ||
                parsedCookies?.podster_token;
            if (!token || typeof token !== "string") {
                return next(new Error("Missing auth token"));
            }
            try {
                // @ts-ignore
                const decoded = (await (fastify.jwt as any).verify(token, {
                    secret: env.HOST_JWT_SECRET
                })) as TokenPayload;
                if (decoded.role === SessionRole.Host) {
                    (socket.data as SocketSessionData).user = { sub: decoded.sub, role: SessionRole.Host };
                    return next();
                }
            } catch {
                // fallthrough to guest verification
            }
            // @ts-ignore
            const decodedGuest = (await (fastify.jwt as any).verify(token, {
                secret: env.GUEST_JWT_SECRET
            })) as TokenPayload;
            if (decodedGuest.role !== SessionRole.Guest) {
                return next(new Error("Invalid token role"));
            }
            (socket.data as SocketSessionData).user = { sub: decodedGuest.sub, role: SessionRole.Guest };
            return next();
        } catch (err) {
            return next(err as Error);
        }
    });

    fastify.io.on("connection", (socket: Socket) => {
        fastify.log.info({ socketId: socket.id }, "Socket connected");

        const emitUserLeft = (sessionId: string) => {
            socket.to(sessionId).emit("user-left", { socketId: socket.id });
        };

        // Join a session room
        socket.on("join-room", async (data: { sessionId?: string }) => {
            const sessionId = data?.sessionId;

            try {
                if (!sessionId || typeof sessionId !== "string") {
                    throw new Error("Invalid session id");
                }
                const sessionData = socket.data as SocketSessionData;
                const user = sessionData.user;
                if (!user) {
                    throw new Error("Unauthorized");
                }
                if (user.role === SessionRole.Guest && user.sub !== sessionId) {
                    throw new Error("Guest token does not match session");
                }

                if (sessionData.sessionId === sessionId) {
                    fastify.log.debug({ socketId: socket.id, sessionId }, "Socket already in room");
                    return;
                }

                if (sessionData.sessionId) {
                    const previousSessionId = sessionData.sessionId;
                    await socket.leave(previousSessionId);
                    emitUserLeft(previousSessionId);
                }

                await socket.join(sessionId);
                sessionData.sessionId = sessionId;

                // Notify others in room
                socket.to(sessionId).emit("user-joined", {
                    socketId: socket.id
                    // In real app, send user metadata (name, role) decoded from token
                });

                fastify.log.info({ socketId: socket.id, sessionId }, "Joined room");
            } catch (e) {
                fastify.log.error({ err: e }, "Socket auth failed");
                socket.disconnect();
            }
        });

        socket.on("leave-room", async () => {
            const sessionData = socket.data as SocketSessionData;
            const activeSessionId = sessionData.sessionId;
            if (!activeSessionId) {
                return;
            }
            await socket.leave(activeSessionId);
            emitUserLeft(activeSessionId);
            delete sessionData.sessionId;
            fastify.log.info({ socketId: socket.id, sessionId: activeSessionId }, "Left room");
        });

        // WebRTC Signaling events
        const forwardEvent = (event: string) => (payload: SignalingPayload | undefined) => {
            const sessionData = socket.data as SocketSessionData;
            const activeSessionId = sessionData.sessionId;
            if (!activeSessionId) {
                fastify.log.warn({ event, from: socket.id }, "Dropping signaling event before room join");
                return;
            }
            if (!payload || typeof payload.to !== "string" || payload.to.trim().length === 0) {
                fastify.log.warn({ event, from: socket.id, payload }, "Dropping malformed signaling payload");
                return;
            }
            const { to, ...rest } = payload;
            const targetSocket = fastify.io.sockets.sockets.get(to);
            if (!targetSocket) {
                fastify.log.warn({ event, from: socket.id, to }, "Dropping signaling event for unknown target socket");
                return;
            }
            if (!targetSocket.rooms.has(activeSessionId)) {
                fastify.log.warn(
                    { event, from: socket.id, to, sessionId: activeSessionId },
                    "Dropping cross-session signaling event"
                );
                return;
            }
            fastify.log.debug({ event, from: socket.id, to }, "Signal forwarding");
            socket.to(to).emit(event, { ...rest, from: socket.id });
        };

        socket.on("offer", forwardEvent("offer"));
        socket.on("answer", forwardEvent("answer"));
        socket.on("ice-candidate", forwardEvent("ice-candidate"));

        socket.on("disconnecting", () => {
            const sessionData = socket.data as SocketSessionData;
            if (sessionData.sessionId) {
                emitUserLeft(sessionData.sessionId);
            }
        });

        socket.on("disconnect", () => {
            const sessionData = socket.data as SocketSessionData;
            delete sessionData.sessionId;
            fastify.log.info({ socketId: socket.id }, "Socket disconnected");
        });
    });
});
