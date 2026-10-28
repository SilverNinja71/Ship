import { afterEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import { WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "@ship/shared-types";
import { createSignalingServer } from "./server.js";
import type { SignalingServer, SignalingServerOptions } from "./server.js";

type Of<T extends ServerMessage["t"]> = Extract<ServerMessage, { t: T }>;

/** A real ws client that queues what it hears, so tests can wait for one message type. */
class TestClient {
  readonly ws: WebSocket;
  private readonly inbox: ServerMessage[] = [];
  private wake: (() => void) | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", (data) => {
      this.inbox.push(JSON.parse(data.toString()) as ServerMessage);
      this.wake?.();
    });
  }

  static async open(url: string, options?: { autoPong?: boolean }): Promise<TestClient> {
    const ws = new WebSocket(url, options);
    await once(ws, "open");
    return new TestClient(ws);
  }

  send(message: ClientMessage | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(message));
  }

  async next<T extends ServerMessage["t"]>(t: T, timeoutMs = 2000): Promise<Of<T>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = this.inbox.findIndex((message) => message.t === t);
      if (index >= 0) return this.inbox.splice(index, 1)[0] as Of<T>;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for "${t}"; got ${JSON.stringify(this.inbox)}`);
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        setTimeout(resolve, left);
      });
    }
  }
}

const avatar = {
  name: "Ada",
  skin: "honey",
  hair: "bob",
  hairColor: "#5A3A22",
  hat: "straw-hat",
  coat: "striped-shirt",
  coatColor: "#C2524A",
  accessory: "none",
  tool: "quill-logbook",
} as const;

function join(room: string, name: string): ClientMessage {
  return { t: "join", room, member: { name, avatar, shipId: "golden-mane", state: "SAILING_FOCUS", focusMinutesToday: 0, audio: true, video: false } };
}

let server: SignalingServer | null = null;
const clients: TestClient[] = [];

async function start(options: SignalingServerOptions = {}) {
  server = await createSignalingServer({ port: 0, ...options });
  return { server, wsUrl: server.url.replace("http", "ws") };
}

async function connect(url: string, options?: { autoPong?: boolean }) {
  const client = await TestClient.open(url, options);
  clients.push(client);
  return client;
}

async function health() {
  const res = await fetch(`${server!.url}/health`);
  return res.json() as Promise<{ ok: boolean; rooms: number; members: number; uptime: number }>;
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.ws.terminate();
  await server?.close();
  server = null;
});

describe("crew server end to end", () => {
  it("runs a two-sailor room: join, shout, signal, focus-tick, leave", async () => {
    // A minute of slack lets the test tick a whole minute without waiting one.
    const { wsUrl } = await start({ hub: { tickSlackMs: 60_000 } });
    expect(await health()).toMatchObject({ ok: true, rooms: 0, members: 0 });

    const ada = await connect(wsUrl);
    const bo = await connect(wsUrl);

    ada.send(join("Night-Watch", "Ada"));
    const adaWelcome = await ada.next("welcome");
    expect(adaWelcome).toMatchObject({ room: "night-watch", members: [{ name: "Ada", seat: 0 }], quest: { beastId: "procrastination-kraken", hp: 120 } });

    bo.send(join("night-watch", "Bo"));
    const boWelcome = await bo.next("welcome");
    expect(boWelcome.members.map((m) => m.name)).toEqual(["Ada", "Bo"]);
    expect(await ada.next("member-joined")).toMatchObject({ member: { peerId: boWelcome.peerId, name: "Bo", seat: 1 } });

    ada.send({ t: "shout", text: "  Ahoy, crew!  " });
    for (const client of [ada, bo]) {
      expect(await client.next("shout")).toMatchObject({ from: adaWelcome.peerId, name: "Ada", text: "Ahoy, crew!" });
    }

    ada.send({ t: "signal", to: boWelcome.peerId, data: { kind: "offer", sdp: "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n" } });
    expect(await bo.next("signal")).toEqual({ t: "signal", from: adaWelcome.peerId, data: { kind: "offer", sdp: "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n" } });

    bo.send({ t: "focus-tick", minutes: 1 });
    for (const client of [ada, bo]) {
      expect(await client.next("quest")).toMatchObject({ quest: { hp: 119 }, hit: { by: boWelcome.peerId, damage: 1 }, defeatedBeast: null });
    }

    bo.send({ t: "leave" });
    expect(await ada.next("member-left")).toEqual({ t: "member-left", peerId: boWelcome.peerId });
    expect(await health()).toMatchObject({ rooms: 1, members: 1 });

    ada.send({ t: "ping" });
    await ada.next("pong");
    ada.ws.close();
    await once(ada.ws, "close");
    await expect.poll(async () => (await health()).members).toBe(0);
  });

  it("drops sockets that stop answering pings", async () => {
    const { wsUrl } = await start({ heartbeatMs: 40 });
    const deaf = await connect(wsUrl, { autoPong: false });
    const healthy = await connect(wsUrl);
    const [code] = (await once(deaf.ws, "close")) as [number];
    expect(code).toBe(1006); // terminated, no close frame
    expect(healthy.ws.readyState).toBe(WebSocket.OPEN);
  });

  it("closes the socket on an oversized frame", async () => {
    const { wsUrl } = await start();
    const client = await connect(wsUrl);
    client.ws.send("x".repeat(70 * 1024));
    const [code] = (await once(client.ws, "close")) as [number];
    expect(code).toBe(1009);
  });

  it("answers unknown paths with 404 and treats /health as read-only", async () => {
    await start();
    expect((await fetch(`${server!.url}/nope`)).status).toBe(404);
    expect((await fetch(`${server!.url}/health`, { method: "POST" })).status).toBe(405);
  });
});
