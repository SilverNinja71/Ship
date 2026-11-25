// Deleting the account's cloud copy (cloudSync.ts deleteCloudData) with Firestore faked: the last
// step, the cooldown stamps, is tried again when the rules (which judge time by the server's
// clock) turn it down, and a failure after part of the copy went says what went instead of
// "Nothing was deleted".

import { afterEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  /** Documents by collection path. */
  docs: {} as Record<string, { id: string; data: Record<string, unknown> }[]>,
  /** Committed batches, as their delete/set paths. */
  batches: [] as string[][],
  /** Refuses (permission-denied) a batch while this says so. */
  refuse: null as null | ((ops: string[]) => boolean),
  rooms: 0,
  readError: null as unknown,
}));

vi.mock("./db.js", () => ({ firestore: () => ({}) }));
vi.mock("./rooms.js", () => ({ leaveAllRooms: async () => fake.rooms }));
vi.mock("firebase/firestore", () => {
  const ref = (path: string) => ({ path });
  return {
    Bytes: { fromUint8Array: (u: Uint8Array) => u },
    arrayRemove: () => ({}),
    arrayUnion: () => ({}),
    collection: (_db: unknown, ...parts: string[]) => ref(parts.join("/")),
    deleteDoc: async () => undefined,
    doc: (_db: unknown, ...parts: string[]) => ref(parts.join("/")),
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    getDocs: async (c: { path: string }) => {
      if (fake.readError) throw fake.readError;
      return { docs: (fake.docs[c.path] ?? []).map((d) => ({ id: d.id, ref: ref(`${c.path}/${d.id}`), data: () => d.data })) };
    },
    onSnapshot: () => () => undefined,
    serverTimestamp: () => "<now>",
    setDoc: async () => undefined,
    writeBatch: () => {
      const ops: string[] = [];
      return {
        delete: (r: { path: string }) => void ops.push(`delete ${r.path}`),
        set: (r: { path: string }) => void ops.push(`set ${r.path}`),
        commit: async () => {
          if (fake.refuse?.(ops)) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
          fake.batches.push(ops);
        },
      };
    },
  };
});

import { PartlyDeleted, deleteCloudData } from "./cloudSync.js";

const UID = "alice";
const longAgo = { toMillis: () => Date.now() - 10 * 60_000 };
const stamps = () => {
  fake.docs[`users/${UID}/state`] = [{ id: "planner", data: {} }];
  fake.docs[`users/${UID}/meta`] = [{ id: "rooms", data: { madeAt: longAgo, joinedAt: longAgo } }];
};

afterEach(() => {
  vi.useRealTimers();
  fake.docs = {};
  fake.batches = [];
  fake.refuse = null;
  fake.rooms = 0;
  fake.readError = null;
});

describe("deleting the cloud copy", () => {
  it("tries the cooldown stamps again a few seconds later when the rules say not yet (this device's clock was fast)", async () => {
    vi.useFakeTimers();
    stamps();
    let refusals = 2;
    fake.refuse = (ops) => ops.some((o) => o.endsWith("/meta/rooms")) && refusals-- > 0;
    const done = deleteCloudData(UID);
    await vi.advanceTimersByTimeAsync(20_000);
    await done;
    expect(fake.batches.at(-1)).toEqual([`delete users/${UID}/meta/rooms`]);
  });

  it("says what went, not \"Nothing was deleted\", when the last step still fails after the copy went", async () => {
    vi.useFakeTimers();
    stamps();
    fake.rooms = 1;
    fake.refuse = (ops) => ops.some((o) => o.endsWith("/meta/rooms"));
    const done = deleteCloudData(UID).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    const error = await done;
    expect(error).toBeInstanceOf(PartlyDeleted);
    expect((error as Error).message).toMatch(/deleted your study rooms and your cloud copy, but couldn't finish/);
  });

  it("says plainly that nothing went when the first step can't reach the cloud", async () => {
    fake.readError = Object.assign(new Error("offline"), { code: "unavailable" });
    const error = await deleteCloudData(UID).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(PartlyDeleted);
    expect((error as Error).message).toMatch(/Can't reach the cloud/);
  });
});
