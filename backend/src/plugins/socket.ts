import fp from "fastify-plugin";
import fastifySocketIO from "fastify-socket.io";
import { Server, Socket } from "socket.io";

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
    fastify.register(fastifySocketIO, {
        cors: {
            origin: "*", // Adjust in production
            methods: ["GET", "POST"]
        }
    });

    fastify.ready((err) => {
        if (err) throw err;

        fastify.io.on("connection", (socket: Socket) => {
            fastify.log.info({ socketId: socket.id }, "Socket connected");

            // Join a session room
            socket.on("join-room", async (data: { sessionId: string; token: string }) => {
                const { sessionId, token } = data;

                try {
                    // Verify token
                    // For now, simpler verification: just check if it claims to be host or guest
                    // Real impl: fastify.jwt.verify(token)
                    // But we need access to verify via plugin scope or manually using jwt library

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
});
