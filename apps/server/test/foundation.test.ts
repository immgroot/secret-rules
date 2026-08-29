import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { parseServerEnvironment, DEVELOPMENT_ORIGINS } from "../src/config/env.ts";
import { createFoundationServer } from "../src/server.ts";

test("development configuration uses loopback and a valid default port", () => {
  assert.deepEqual(parseServerEnvironment({}), {
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: 3001,
    ALLOWED_ORIGINS: DEVELOPMENT_ORIGINS,
    RECONNECT_GRACE_MS: 60_000,
    ROOM_IDLE_TIMEOUT_MS: 7_200_000,
    AFK_TIMEOUT_MS: 180_000,
  });
});

test("production requires explicit configuration and parses a supplied port", () => {
  assert.throws(
    () => parseServerEnvironment({ NODE_ENV: "production" }),
    /explicit HOST and PORT/,
  );
  assert.deepEqual(
    parseServerEnvironment({ NODE_ENV: "production", HOST: "127.0.0.1", PORT: "4100", ALLOWED_ORIGINS: "https://secret-rules.example" }),
    { NODE_ENV: "production", HOST: "127.0.0.1", PORT: 4100, ALLOWED_ORIGINS: ["https://secret-rules.example"], RECONNECT_GRACE_MS: 60_000, ROOM_IDLE_TIMEOUT_MS: 7_200_000, AFK_TIMEOUT_MS: 180_000 },
  );
});

test("invalid configuration is rejected without echoing its values", () => {
  for (const environment of [
    { PORT: "0" },
    { PORT: "65536" },
    { PORT: "3001.5" },
    { HOST: "https://not-a-bind-address.example" },
    { NODE_ENV: "invalid-example-value" },
    { ALLOWED_ORIGINS: "https://example.com/path" },
    { ALLOWED_ORIGINS: "https://user:password@example.com" },
    { ALLOWED_ORIGINS: "*" },
    { RECONNECT_GRACE_MS: "0" },
    { ROOM_IDLE_TIMEOUT_MS: "-1" },
    { AFK_TIMEOUT_MS: "0" },
  ]) {
    assert.throws(() => parseServerEnvironment(environment), /Invalid server environment/);
  }

  assert.throws(
    () => parseServerEnvironment({ PORT: "do-not-echo-this-example-value" }),
    { message: "Invalid server environment: PORT" },
  );
});

test("the base HTTP handler exposes health only; Socket.IO attaches separately", async (context) => {
  const server = createFoundationServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(
    () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  );

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.deepEqual(await health.json(), { service: "secret-rules-server", status: "ok" });

  for (const path of ["/", "/rooms", "/socket.io/?EIO=4&transport=polling"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "");
  }

  const unsupportedMethod = await fetch(`${baseUrl}/health`, { method: "POST" });
  assert.equal(unsupportedMethod.status, 404);
});
