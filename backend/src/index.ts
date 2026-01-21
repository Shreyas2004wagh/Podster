import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifySensible from "@fastify/sensible";
import fastifyFormbody from "@fastify/formbody";
import { env } from "./config/env";
import { authPlugin } from "./plugins/auth";
import sessionsRoutes from "./routes/sessions";

const server = Fastify({
  logger: true
});

server.register(fastifyCors, { origin: "*" });
server.register(fastifySensible);
server.register(fastifyFormbody);
server.register(authPlugin);
server.register(sessionsRoutes);

server.get("/health", async () => ({ status: "ok" }));

server.listen({ port: env.PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`Server listening on ${address}`);
});
