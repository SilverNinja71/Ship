// One Node http server for everything: GET /health, POST /relay (and its CORS
// preflight), and the crew WebSocket on any upgrade request.

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import { RELAY_PATH, SIGNALING_DEFAULT_PORT } from "@ship/shared-types";
import { sendJson } from "./http.js";
import { MAX_MESSAGE_BYTES } from "./protocol.js";
import { createRelay } from "./relay.js";
import type { RelayOptions } from "./relay.js";
import { CrewHub } from "./rooms.js";
import type { CrewHubOptions } from "./rooms.js";

export interface SignalingServerOptions {
  /** 0 picks a free port (tests). Default SIGNALING_DEFAULT_PORT (8787). */
  port?: number;
  /** Default 127.0.0.1, this computer only. "0.0.0.0" lets friends on your network join. */
  host?: string;
  relay?: RelayOptions;
  hub?: CrewHubOptions;
  /** How often sockets are pinged; one missed pong drops them. Default 30 s. */
  heartbeatMs?: number;
}

export interface SignalingServer {
  readonly port: number;
  readonly host: string;
  /** http://host:port. The crew socket is the same address with ws://. */
  readonly url: string;
  readonly hub: CrewHub;
  /** Drops every socket and stops listening. Safe to call twice. */
  close(): Promise<void>;
}

/** A socket whose unsent backlog grows past this has stopped reading; drop it. */
const MAX_BUFFERED_BYTES = 1024 * 1024;

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.isBuffer(data) ? data.toString("utf8") : Buffer.from(data).toString("utf8");
}

export async function createSignalingServer(options: SignalingServerOptions = {}): Promise<SignalingServer> {
  const host = options.host ?? "127.0.0.1";
  const hub = new CrewHub(options.hub);
  const relay = createRelay(options.relay);
  const startedAt = Date.now();

  function health(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Use GET." }, { allow: "GET, HEAD" });
    const { rooms, members } = hub.stats();
    const uptime = Math.round((Date.now() - startedAt) / 1000);
    // Only counts, so any page may ask whether the crew server is up.
    sendJson(res, 200, { ok: true, rooms, members, uptime }, { "access-control-allow-origin": "*" });
  }

  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?", 1)[0];
    if (path === "/health") return health(req, res);
    if (path === RELAY_PATH) return void relay.handle(req, res);
    sendJson(res, 404, { error: "Not found." });
  });

  // perMessageDeflate stays off (the ws default), so there are no zip bombs to worry about.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const alive = new WeakSet<WebSocket>();
  wss.on("connection", (ws: WebSocket) => {
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    // ws closes the socket itself (1009 for an oversized frame); an unhandled
    // "error" event would crash the process.
    ws.on("error", () => {});
    const conn = hub.connect((message) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return ws.terminate();
      ws.send(JSON.stringify(message));
    });
    ws.on("message", (data) => conn.handle(rawToString(data)));
    ws.on("close", () => conn.disconnect());
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port ?? SIGNALING_DEFAULT_PORT, host, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (err) {
    wss.close();
    throw err;
  }

  // A socket that missed the last ping is gone (laptop lid shut, Wi-Fi dropped).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, options.heartbeatMs ?? 30_000);
  heartbeat.unref();

  const port = (server.address() as AddressInfo).port;
  let closing: Promise<void> | null = null;
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
      });
    })());

  return {
    port,
    host,
    url: `http://${host.includes(":") ? `[${host}]` : host}:${port}`,
    hub,
    close,
  };
}
