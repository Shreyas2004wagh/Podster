
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifySensible from "@fastify/sensible";
import fastifyFormbody from "@fastify/formbody";
import { env } from "./config/env.js";
import { authPlugin } from "./plugins/auth.js";
import socketPlugin from "./plugins/socket.js";
import sessionsRoutes from "./routes/sessions.js";

const server = Fastify({
  logger: true
});

server.register(fastifyCors, { origin: "*" });
server.register(fastifySensible);
server.register(fastifyFormbody);
server.register(authPlugin);
server.register(socketPlugin);
server.register(sessionsRoutes);

server.get("/health", async () => ({ status: "ok" }));

server.listen({ port: env.PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`Server listening on ${address}`);
});
