import { createServer } from "node:http";
import { HealthResponseSchema } from "@secret-rules/shared";
import { attachRealtime, type RealtimeOptions } from "./realtime/transport.ts";

export function createFoundationServer() {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      const payload = HealthResponseSchema.parse({
        service: "secret-rules-server",
        status: "ok",
      });

      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(payload));
      return;
    }

    response.writeHead(404);
    response.end();
  });
}

export function createGameServer(options: RealtimeOptions) {
  const httpServer = createFoundationServer();
  return { httpServer, ...attachRealtime(httpServer, options) };
}
