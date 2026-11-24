// Cloud sync for signed-in sailors. Loaded only after someone signs in, so
// visitors who never do don't download Firestore at all.
//
// The account's copy lives in Firestore under users/{uid}:
//   state/{store}   one document per synced store: its synced fields as JSON text
//   notes/{id}      one document per uploaded note, gzip-compressed
//   meta/notes      the list of note ids, changed atomically so two devices can't clobber it
// Only the account itself may read or write there (firestore.rules).
//
// What syncs and who wins are decided in syncPlan.ts. In short: each store is
// one unit, the later change wins, and changes reach other devices within
// seconds while both are online.

import {
  Bytes,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { DocumentData, Unsubscribe } from "firebase/firestore";
import type { NoteDocument } from "@ship/shared-types";
import { useCustomizer } from "../stores/shipCustomizer.js";
import { useEconomy } from "../stores/economyStore.js";
import { mergeNotes, notesLoaded, useFleet } from "../stores/fleetStore.js";
import { usePlanner } from "../stores/plannerStore.js";
import { useRecall } from "../stores/recallStore.js";
import { useSettings } from "../stores/settingsStore.js";
import { useSync } from "../stores/syncStore.js";
import type { SyncChoice } from "../stores/syncStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { firestore } from "./db.js";
import { saveNotes } from "./noteVault.js";
import { SYNC_META_KEY, onShipStorageWrite, storageKey } from "./storage.js";
import {
  MAX_NOTE_BYTES,
  SYNCED_FIELDS,
  SYNCED_KEYS,
  decideKey,
  docIdForKey,
  keyForDocId,
  localHasProgress,
  mergeIntoLocal,
  noteDocId,
  packNote,
  parseMeta,
  parsePersisted,
  planNotes,
  projectForSync,
  remoteBeatsPending,
  syncFingerprint,
  unpackNote,
} from "./syncPlan.js";
import type { RemoteState, SyncMeta } from "./syncPlan.js";

/** How long a store waits after its last change before saving it to the cloud. */
const SAVE_DELAY_MS = 2500;

/** Notes read from an Obsidian vault stay on the device: the vault is their home, and Obsidian syncs it its own way. */
const syncsToCloud = (note: NoteDocument) => note.source !== "obsidian";

/** After the cloud copy replaces a store's saved value, the store reads it back in. */
const REHYDRATE: Record<string, () => unknown> = {
  [storageKey("planner")]: () => usePlanner.persist.rehydrate(),
  [storageKey("voyage")]: () => useVoyage.persist.rehydrate(),
  [storageKey("economy")]: () => useEconomy.persist.rehydrate(),
  [storageKey("recall")]: () => useRecall.persist.rehydrate(),
  [storageKey("customizer")]: () => useCustomizer.persist.rehydrate(),
  [storageKey("fleet")]: () => useFleet.persist.rehydrate(),
  [storageKey("settings")]: () => useSettings.persist.rehydrate(),
};


const newRev = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function toRemote(data: DocumentData | undefined): RemoteState | null {
  if (!data || typeof data.json !== "string" || typeof data.rev !== "string") return null;
  try {
    const state: unknown = JSON.parse(data.json);
    if (typeof state !== "object" || state === null || Array.isArray(state)) return null;
    const at = data.updatedAt as { toMillis?: () => number } | null | undefined;
    return {
      persisted: { state: state as Record<string, unknown>, version: typeof data.version === "number" ? data.version : 0 },
      rev: data.rev,
      updatedAt: typeof at?.toMillis === "function" ? at.toMillis() : 0,
    };
  } catch {
    return null;
  }
}

/** Plain words for what went wrong. Firestore's own messages name codes, not causes. */
export function syncProblem(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  const message = e instanceof Error ? e.message : String(e);
  if (code === "permission-denied") return "The cloud refused to save your progress. Its database or access rules may not be switched on yet.";
  if (code === "not-found" || code === "failed-precondition" || /does not exist/i.test(message)) return "Cloud saving isn't switched on for Ship yet (its Firestore database doesn't exist).";
  if (code === "unavailable") return "Can't reach the cloud right now. Your progress is safe here and will sync when you're back online.";
  if (code === "resource-exhausted") return "The cloud is over its free daily limit. Your progress is safe here and will sync tomorrow.";
  return `Sync stopped: ${message}`;
}

/** True when the error means nothing was ever stored (no database, or access never granted). */
const nothingStored = (e: unknown) => /permission-denied|not-found|failed-precondition/.test(String((e as { code?: unknown })?.code ?? "")) || /does not exist/i.test(String((e as Error)?.message ?? ""));

class SyncSession {
  private meta: SyncMeta;
  private stopped = false;
  private unsubs: (() => void)[] = [];
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inflight = 0;
  /** Revisions this browser wrote, so their echo isn't mistaken for another device's change. */
  private sentRevs = new Set<string>();
  /** Notes being uploaded or removed right now, so a list update doesn't repeat the work. */
  private noteBusy = new Set<string>();

  constructor(readonly uid: string) {
    this.meta = { uid, keys: {}, notes: [] };
  }

  private ref(...path: string[]) {
    return doc(firestore(), "users", this.uid, ...(path as [string, ...string[]]));
  }

  private saveMeta(): void {
    try {
      localStorage.setItem(SYNC_META_KEY, JSON.stringify(this.meta));
    } catch {
      // A full or blocked localStorage only costs a fuller reconcile next time.
    }
  }

  private settle(): void {
    if (this.stopped) return;
    const busy = this.inflight > 0 || this.timers.size > 0;
    useSync.setState(busy ? { status: "saving" } : { status: "synced", message: null, lastSyncedAt: Date.now() });
  }

  private fail(e: unknown): void {
    if (this.stopped) return;
    console.warn("Ship's cloud sync stopped.", e);
    useSync.setState({ status: "error", message: syncProblem(e) });
  }

  async begin(): Promise<void> {
    useSync.setState({ status: "starting", message: null, choose: null });
    await notesLoaded;
    const [stateSnap, indexSnap] = await Promise.all([getDocs(collection(firestore(), "users", this.uid, "state")), getDoc(this.ref("meta", "notes"))]);
    if (this.stopped) return;
    const remote = new Map<string, RemoteState>();
    for (const d of stateSnap.docs) {
      const key = keyForDocId(d.id);
      const r = toRemote(d.data());
      if (SYNCED_FIELDS[key] && r) remote.set(key, r);
    }
    const remoteNotes = noteIds(indexSnap.data());

    const saved = parseMeta(localStorage.getItem(SYNC_META_KEY));
    if (saved && saved.uid === this.uid) {
      this.meta = saved;
      await this.reconcile(remote, remoteNotes);
    } else {
      const remoteEmpty = remote.size === 0 && remoteNotes.length === 0;
      const localEmpty = !localHasProgress((k) => localStorage.getItem(k), useFleet.getState().notes.filter(syncsToCloud).length);
      const choice: SyncChoice | null = remoteEmpty ? "local" : localEmpty ? "cloud" : await this.ask();
      if (this.stopped) return;
      if (!choice) {
        useSync.setState({ status: "paused", message: "Nothing is syncing until you choose which progress to keep." });
        return;
      }
      await this.firstSync(choice, remote, remoteNotes);
    }
    if (this.stopped) return;
    this.saveMeta();
    this.listen();
    this.settle();
  }

  private ask(): Promise<SyncChoice | null> {
    return new Promise((resolve) => {
      useSync.setState({
        status: "needs-choice",
        choose: (choice) => {
          useSync.setState({ choose: null, status: "starting" });
          resolve(choice);
        },
      });
    });
  }

  /** This browser has never synced with this account: one side replaces the other, and notes from both are kept. */
  private async firstSync(choice: SyncChoice, remote: Map<string, RemoteState>, remoteNotes: string[]): Promise<void> {
    for (const key of SYNCED_KEYS) {
      const r = remote.get(key);
      const hasLocal = parsePersisted(localStorage.getItem(key)) !== null;
      if (r && (choice === "cloud" || !hasLocal)) this.applyRemote(key, r);
      else if (hasLocal) await this.pushKey(key, true);
    }
    await this.syncNotes(remoteNotes, null);
  }

  private async reconcile(remote: Map<string, RemoteState>, remoteNotes: string[]): Promise<void> {
    for (const key of SYNCED_KEYS) {
      const r = remote.get(key) ?? null;
      const action = decideKey(syncFingerprint(key, localStorage.getItem(key)), this.meta.keys[key], r);
      if (action === "pull" && r) this.applyRemote(key, r);
      else if (action === "push") await this.pushKey(key, true);
    }
    await this.syncNotes(remoteNotes, this.meta.notes);
  }

  /** Writes the cloud's synced fields into this browser's saved copy, then has the store read it back. */
  private applyRemote(key: string, r: RemoteState): void {
    const merged = JSON.stringify(mergeIntoLocal(key, parsePersisted(localStorage.getItem(key)), r.persisted));
    localStorage.setItem(key, merged);
    this.meta.keys[key] = { hash: syncFingerprint(key, merged), rev: r.rev };
    this.saveMeta();
    void REHYDRATE[key]?.();
  }

  private async pushKey(key: string, force = false): Promise<void> {
    const raw = localStorage.getItem(key);
    const persisted = parsePersisted(raw);
    if (!persisted) return;
    const hash = syncFingerprint(key, raw);
    const known = this.meta.keys[key];
    if (!force && known && known.hash === hash && known.rev) return;
    const projection = projectForSync(key, persisted);
    const rev = newRev();
    this.sentRevs.add(rev);
    this.meta.keys[key] = { hash, rev };
    this.saveMeta();
    this.inflight++;
    this.settle();
    try {
      await setDoc(this.ref("state", docIdForKey(key)), { json: JSON.stringify(projection.state), version: projection.version, rev, updatedAt: serverTimestamp() });
    } catch (e) {
      // Remember it's unsent, so the next start sends it.
      this.meta.keys[key] = { hash: known?.hash ?? "", rev: known?.rev ?? null, dirtyAt: Date.now() };
      this.saveMeta();
      throw e;
    } finally {
      this.inflight--;
      this.settle();
    }
  }

  private schedule(key: string): void {
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.pushKey(key).catch((e: unknown) => this.fail(e));
      }, SAVE_DELAY_MS),
    );
    this.settle();
  }

  /** Sends every waiting change now: the tab is being hidden or closed. */
  flush(): void {
    for (const [key, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(key);
      this.pushKey(key).catch((e: unknown) => this.fail(e));
    }
  }

  private onLocalWrite(key: string): void {
    if (this.stopped || !SYNCED_FIELDS[key]) return;
    const hash = syncFingerprint(key, localStorage.getItem(key));
    const known = this.meta.keys[key];
    if (known && hash === known.hash) {
      // Changed back to what the cloud has, or the store re-saved what sync just wrote.
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
      if (known.dirtyAt !== undefined) {
        delete known.dirtyAt;
        this.saveMeta();
      }
      this.settle();
      return;
    }
    this.meta.keys[key] = { hash: known?.hash ?? "", rev: known?.rev ?? null, dirtyAt: Date.now() };
    this.saveMeta();
    this.schedule(key);
  }

  private onRemoteState(key: string, r: RemoteState): void {
    if (this.sentRevs.has(r.rev)) return;
    const known = this.meta.keys[key];
    if (known?.rev === r.rev) return;
    if (this.timers.has(key)) {
      if (!remoteBeatsPending(r.updatedAt, known?.dirtyAt)) return;
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    this.applyRemote(key, r);
    this.settle();
  }

  private listen(): void {
    this.unsubs.push(onShipStorageWrite((key) => this.onLocalWrite(key)));

    this.unsubs.push(
      onSnapshot(
        collection(firestore(), "users", this.uid, "state"),
        (snap) => {
          for (const change of snap.docChanges()) {
            if (change.type === "removed" || change.doc.metadata.hasPendingWrites) continue;
            const key = keyForDocId(change.doc.id);
            const r = toRemote(change.doc.data());
            if (SYNCED_FIELDS[key] && r) this.onRemoteState(key, r);
          }
        },
        (e) => this.fail(e),
      ) as Unsubscribe,
    );

    this.unsubs.push(
      onSnapshot(
        this.ref("meta", "notes"),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          this.syncNotes(noteIds(snap.data()), this.meta.notes).catch((e: unknown) => this.fail(e));
        },
        (e) => this.fail(e),
      ) as Unsubscribe,
    );

    this.unsubs.push(
      useFleet.subscribe((s, prev) => {
        if (s.notes === prev.notes || this.stopped) return;
        const now = new Set(s.notes.map((n) => n.id));
        const before = new Set(prev.notes.map((n) => n.id));
        for (const note of s.notes) if (syncsToCloud(note) && !before.has(note.id) && !this.meta.notes.includes(note.id)) this.uploadNote(note).catch((e: unknown) => this.fail(e));
        for (const id of before) if (!now.has(id) && this.meta.notes.includes(id)) this.deleteRemoteNote(id).catch((e: unknown) => this.fail(e));
      }),
    );

    const onHide = () => {
      if (document.visibilityState === "hidden") this.flush();
    };
    const onPageHide = () => this.flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    this.unsubs.push(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    });
  }

  // ---- Notes ----------------------------------------------------------------

  private async syncNotes(remoteIds: string[], lastSynced: string[] | null): Promise<void> {
    const localIds = useFleet.getState().notes.filter(syncsToCloud).map((n) => n.id);
    const plan = planNotes(localIds, remoteIds, lastSynced);
    const byId = new Map(useFleet.getState().notes.map((n) => [n.id, n]));
    for (const id of plan.upload) {
      const note = byId.get(id);
      if (note && !this.noteBusy.has(id)) await this.uploadNote(note);
    }
    for (const id of plan.download) await this.downloadNote(id);
    for (const id of plan.deleteLocal) this.deleteLocalNote(id);
    for (const id of plan.deleteRemote) if (!this.noteBusy.has(id)) await this.deleteRemoteNote(id);
  }

  private async uploadNote(note: NoteDocument): Promise<void> {
    if (this.noteBusy.has(note.id)) return;
    this.noteBusy.add(note.id);
    this.inflight++;
    this.settle();
    try {
      const bytes = await packNote(note);
      if (bytes.length > MAX_NOTE_BYTES) {
        const tooBig = useSync.getState().tooBig;
        if (!tooBig.includes(note.title)) useSync.setState({ tooBig: [...tooBig, note.title] });
        return;
      }
      await setDoc(this.ref("notes", noteDocId(note.id)), { data: Bytes.fromUint8Array(bytes), title: note.title, updatedAt: serverTimestamp() });
      await setDoc(this.ref("meta", "notes"), { ids: arrayUnion(note.id) }, { merge: true });
      if (!this.meta.notes.includes(note.id)) this.meta.notes.push(note.id);
      this.saveMeta();
    } finally {
      this.noteBusy.delete(note.id);
      this.inflight--;
      this.settle();
    }
  }

  private async downloadNote(id: string): Promise<void> {
    const snap = await getDoc(this.ref("notes", noteDocId(id)));
    const data = snap.data();
    const note = data?.data instanceof Bytes ? await unpackNote(data.data.toUint8Array()) : null;
    if (!note || this.stopped) return;
    // Recorded first, so the fleet store's change below isn't taken for a new local note.
    if (!this.meta.notes.includes(id)) this.meta.notes.push(id);
    this.saveMeta();
    await saveNotes([note]).catch((e: unknown) => console.warn("Ship couldn't save a synced note.", e));
    useFleet.setState({ notes: mergeNotes(useFleet.getState().notes, [note]) });
  }

  private deleteLocalNote(id: string): void {
    // Forgotten first, so removing it here isn't sent back to the cloud as a deletion.
    this.meta.notes = this.meta.notes.filter((n) => n !== id);
    this.saveMeta();
    if (useFleet.getState().notes.some((n) => n.id === id)) useFleet.getState().removeNote(id);
  }

  private async deleteRemoteNote(id: string): Promise<void> {
    this.noteBusy.add(id);
    try {
      await setDoc(this.ref("meta", "notes"), { ids: arrayRemove(id) }, { merge: true });
      await deleteDoc(this.ref("notes", noteDocId(id)));
      this.meta.notes = this.meta.notes.filter((n) => n !== id);
      this.saveMeta();
    } finally {
      this.noteBusy.delete(id);
    }
  }

  stop(): void {
    this.flush();
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const un of this.unsubs) un();
    this.unsubs = [];
    const { choose } = useSync.getState();
    choose?.(null);
  }
}

function noteIds(data: DocumentData | undefined): string[] {
  return Array.isArray(data?.ids) ? data.ids.filter((id: unknown): id is string => typeof id === "string") : [];
}

let current: SyncSession | null = null;

/** Starts syncing for this account, or keeps the sync already running for it. */
export async function startSync(uid: string): Promise<void> {
  if (current?.uid === uid) return;
  stopSync();
  const session = new SyncSession(uid);
  current = session;
  try {
    await session.begin();
  } catch (e) {
    if (current === session) {
      console.warn("Ship's cloud sync couldn't start.", e);
      useSync.setState({ status: "error", message: syncProblem(e) });
    }
  }
}

export function stopSync(): void {
  current?.stop();
  current = null;
  useSync.setState({ status: "off", message: null, choose: null, tooBig: [] });
}

/** Starts again from the top: after an error, or to answer the first-sync question that was put off. */
export async function retrySync(): Promise<void> {
  const uid = current?.uid;
  if (!uid) return;
  stopSync();
  await startSync(uid);
}

/** When the rules let a cooldown stamp go (local ms, with 1 s of slack): bottles after 20 s, rooms 60 s after opening and 10 s after joining. */
function stampDueAt(path: string, data: DocumentData): number {
  const after = (v: unknown, seconds: number) => {
    const at = (v as { toMillis?: () => number } | null | undefined)?.toMillis?.();
    return typeof at === "number" ? at + (seconds + 1) * 1000 : 0;
  };
  return path.endsWith("/meta/bottles") ? after(data.lastAt, 20) : Math.max(after(data.madeAt, 60), after(data.joinedAt, 10));
}

/**
 * Deletes everything this account keeps in the cloud. Used before deleting the
 * account itself, which would otherwise leave the data behind with no way to
 * reach it. Returns quietly when the cloud never held anything.
 */
export async function deleteCloudData(uid: string): Promise<void> {
  stopSync();
  // Once one read has worked, the database exists: a refusal after that is a real failure, not "nothing stored".
  let readOk = false;
  try {
    const store = firestore();
    // Leave (or close) every Study Room first, while the private notes saying which rooms are ours still exist.
    await (await import("./rooms.js")).leaveAllRooms(uid);
    // Bottles this sailor set afloat go too (with their deck cards), while the private notes that they're theirs still exist.
    const shared = await getDocs(collection(store, "users", uid, "shared"));
    readOk = true;
    // 10 bottles a batch: deleting a bottle and its cards costs the rules a lookup each, and one batch may make at most 20.
    for (let i = 0; i < shared.docs.length; i += 10) {
      const batch = writeBatch(store);
      for (const d of shared.docs.slice(i, i + 10)) {
        batch.delete(doc(store, "bottles", d.id, "deck", "cards"));
        batch.delete(doc(store, "bottles", d.id));
      }
      await batch.commit();
    }
    const docs = (await Promise.all(["state", "notes", "meta", "shared", "rooms"].map((name) => getDocs(collection(store, "users", uid, name))))).flatMap((snap) => snap.docs);
    // The bottle and room cooldown stamps can only go once their time is up (see firestore.rules), so they go last.
    const isStamp = (path: string) => path.endsWith("/meta/bottles") || path.endsWith("/meta/rooms");
    const stamps = docs.filter((d) => isStamp(d.ref.path));
    const refs = docs.filter((d) => !isStamp(d.ref.path)).map((d) => d.ref);
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(store);
      for (const ref of refs.slice(i, i + 400)) batch.delete(ref);
      await batch.commit();
    }
    if (stamps.length) {
      const dueAt = Math.max(...stamps.map((d) => stampDueAt(d.ref.path, d.data())));
      // At most 61 s, even if this device's clock is behind.
      const wait = Math.min(dueAt - Date.now(), 61_000);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const batch = writeBatch(store);
      for (const d of stamps) batch.delete(d.ref);
      await batch.commit();
    }
  } catch (e) {
    if (!readOk && nothingStored(e)) return;
    throw new Error(syncProblem(e));
  }
}
