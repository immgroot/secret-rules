import { parseServerEnvironment } from "./config/env.ts";
import { createGameServer } from "./server.ts";

const environment = parseServerEnvironment(process.env);
const application = createGameServer({ allowedOrigins: environment.ALLOWED_ORIGINS, graceMs: environment.RECONNECT_GRACE_MS, idleMs: environment.ROOM_IDLE_TIMEOUT_MS, afkMs: environment.AFK_TIMEOUT_MS });
const server = application.httpServer;

server.on("error", () => {
  console.error("SECRET RULES server failed to listen. Check HOST, PORT, and port availability.");
  process.exitCode = 1;
});

server.listen(environment.PORT, environment.HOST, () => {
  console.info(`SECRET RULES lobby server listening on port ${environment.PORT}.`);
});

function shutdown() {
  void application.close().catch(() => { console.error("SECRET RULES server could not close cleanly."); process.exitCode = 1; });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
