// `npm run dev` / `npm start` run this. Settings come from the environment:
//   PORT          default 8787 (SIGNALING_DEFAULT_PORT)
//   HOST          default 127.0.0.1; 0.0.0.0 lets friends on your network join
//   CANVAS_HOSTS  extra Canvas hosts for /relay, comma-separated, e.g. canvas.myschool.edu

import { SIGNALING_DEFAULT_PORT } from "@ship/shared-types";
import { parseHostList } from "./relay.js";
import { createSignalingServer } from "./server.js";
import type { SignalingServer } from "./server.js";

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return SIGNALING_DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT must be a whole number from 0 to 65535, not "${value}".`);
  return port;
}

const canvasHosts = parseHostList(process.env.CANVAS_HOSTS);
let server: SignalingServer;
try {
  server = await createSignalingServer({
    port: readPort(process.env.PORT),
    host: process.env.HOST || undefined,
    relay: { canvasHosts },
  });
} catch (err) {
  console.error(`Ship crew server could not start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const extraHosts = canvasHosts.length > 0 ? `; extra Canvas hosts: ${canvasHosts.join(", ")}` : "";
console.log(`Ship crew server on ${server.url.replace(/^http/, "ws")} (health: ${server.url}/health${extraHosts})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void server.close().finally(() => process.exit(0)));
}
