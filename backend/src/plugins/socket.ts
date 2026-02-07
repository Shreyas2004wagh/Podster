import fp from "fastify-plugin";
import { Server, Socket } from "socket.io";
import { env } from "../config/env.js";
import { SessionRole } from "../models/session.js";

declare module "fastify" {
    interface FastifyInstance {
        io: Server;
    }
}

interface SignalingPayload {
    to: string; // socket ID of target
    [key: string]: any;
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
                const decoded = await fastify.jwt.verify(token, { secret: env.HOST_JWT_SECRET });
                if (decoded.role === SessionRole.Host) {
                    socket.data.user = { sub: decoded.sub, role: SessionRole.Host };
                    return next();
                }
            } catch {
                // fallthrough to guest verification
            }
            // @ts-ignore
            const decodedGuest = await fastify.jwt.verify(token, { secret: env.GUEST_JWT_SECRET });
            if (decodedGuest.role !== SessionRole.Guest) {
                return next(new Error("Invalid token role"));
            }
            socket.data.user = { sub: decodedGuest.sub, role: SessionRole.Guest };
            return next();
        } catch (err) {
            return next(err as Error);
        }
    });

    fastify.io.on("connection", (socket: Socket) => {
        fastify.log.info({ socketId: socket.id }, "Socket connected");

        // Join a session room
        socket.on("join-room", async (data: { sessionId: string }) => {
            const { sessionId } = data;

            try {
                const user = socket.data.user as { sub: string; role: SessionRole } | undefined;
                if (!user) {
                    throw new Error("Unauthorized");
                }
                if (user.role === SessionRole.Guest && user.sub !== sessionId) {
                    throw new Error("Guest token does not match session");
                }

                await socket.join(sessionId);

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

        // WebRTC Signaling events
        const forwardEvent = (event: string) => (payload: SignalingPayload) => {
            const { to, ...rest } = payload;
            fastify.log.debug({ event, from: socket.id, to }, "Signal forwarding");
            socket.to(to).emit(event, { ...rest, from: socket.id });
        };

        socket.on("offer", forwardEvent("offer"));
        socket.on("answer", forwardEvent("answer"));
        socket.on("ice-candidate", forwardEvent("ice-candidate"));

        socket.on("disconnect", () => {
            fastify.log.info({ socketId: socket.id }, "Socket disconnected");
            // TODO: Notify rooms this socket was in?
            // socket.io handles room leave auto, but we might want to emit 'user-left' manually
            // Since we don't track which room easily here without extra state,
            // rely on clients handling peer disconnection or improve tracking.
        });
    });
});
