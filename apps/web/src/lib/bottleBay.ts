// Bottle Bay's database side (Firestore). Each action writes everything it
// touches in one batch, because the rules in firestore.rules check the pieces
// together: a bottle goes out with its sharer's private "this is mine" note
// and cooldown stamp, and a report goes out with its +1. Loaded only when the
// Bottle Bay panel opens.

import { collection, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp, startAfter, where, writeBatch } from "firebase/firestore";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { BOTTLE_LIMITS } from "@ship/shared-types";
import type { Bottle, BottleCard, BottleReportReason, BottleSourceType } from "@ship/shared-types";
import type { BottleData } from "./bottleRules.js";
import { firestore } from "./db.js";

const PAGE = 40;
const SOURCE_TYPES = new Set<unknown>(["website", "video", "pdf", "article", "book", "other"]);

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const millis = (v: unknown) => (v && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as { toMillis(): number }).toMillis() : Date.now());

/** A bottle as the database holds it, or null if it's malformed (the rules make that rare). */
function toBottle(id: string, d: DocumentData | undefined): Bottle | null {
  if (!d || (d.kind !== "source" && d.kind !== "deck") || typeof d.title !== "string") return null;
  const cards = (v: unknown): BottleCard[] =>
    Array.isArray(v) ? v.filter((c): c is BottleCard => !!c && typeof c.f === "string" && typeof c.b === "string").map((c) => ({ f: str(c.f, BOTTLE_LIMITS.cardSide), b: str(c.b, BOTTLE_LIMITS.cardSide) })) : [];
  return {
    id,
    kind: d.kind,
    title: str(d.title, BOTTLE_LIMITS.title),
    url: typeof d.url === "string" && d.url.startsWith("https://") ? d.url : null,
    sourceType: SOURCE_TYPES.has(d.sourceType) ? (d.sourceType as BottleSourceType) : null,
    subject: str(d.subject, BOTTLE_LIMITS.subject),
    subjectKey: str(d.subjectKey, BOTTLE_LIMITS.subject),
    tags: Array.isArray(d.tags) ? d.tags.filter((t: unknown): t is string => typeof t === "string").slice(0, BOTTLE_LIMITS.tags) : [],
    description: str(d.description, BOTTLE_LIMITS.description),
    cardCount: typeof d.cardCount === "number" ? d.cardCount : 0,
    preview: cards(d.preview).slice(0, BOTTLE_LIMITS.preview),
    at: millis(d.at),
    reports: typeof d.reports === "number" ? d.reports : 0,
  };
}

export interface BottlePage {
  bottles: Bottle[];
  /** Pass back to load the next page; null when there's no more. */
  cursor: QueryDocumentSnapshot | null;
}

/** The newest bottles, or every bottle on one subject. */
export async function listBottles(opts: { subjectKey?: string; after?: QueryDocumentSnapshot | null } = {}): Promise<BottlePage> {
  const store = firestore();
  const bottles = collection(store, "bottles");
  // A subject is looked up on its own (sorted here), which needs no extra database index.
  const q = opts.subjectKey
    ? query(bottles, where("subjectKey", "==", opts.subjectKey), limit(PAGE * 2))
    : query(bottles, orderBy("at", "desc"), ...(opts.after ? [startAfter(opts.after)] : []), limit(PAGE));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => toBottle(d.id, d.data())).filter((b): b is Bottle => b !== null);
  return { bottles: list, cursor: !opts.subjectKey && snap.docs.length === PAGE ? snap.docs[snap.docs.length - 1]! : null };
}

/** Sets a bottle afloat. Its id is random, and nothing in it names the sharer. */
export async function setAfloat(uid: string, bottle: BottleData, cards: readonly BottleCard[]): Promise<string> {
  const store = firestore();
  const ref = doc(collection(store, "bottles"));
  const batch = writeBatch(store);
  batch.set(doc(store, "users", uid, "meta", "bottles"), { lastAt: serverTimestamp() });
  batch.set(doc(store, "users", uid, "shared", ref.id), { at: serverTimestamp() });
  batch.set(ref, { ...bottle, at: serverTimestamp() });
  if (bottle.kind === "deck") batch.set(doc(store, "bottles", ref.id, "deck", "cards"), { cards: cards.map((c) => ({ f: c.f, b: c.b })) });
  await batch.commit();
  return ref.id;
}

/** The bottles this sailor set afloat, from their private list. */
export async function myBottles(uid: string): Promise<Bottle[]> {
  const store = firestore();
  const shared = await getDocs(collection(store, "users", uid, "shared"));
  const docs = await Promise.all(shared.docs.map((d) => getDoc(doc(store, "bottles", d.id))));
  return docs.map((d) => (d.exists() ? toBottle(d.id, d.data()) : null)).filter((b): b is Bottle => b !== null).sort((a, b) => b.at - a.at);
}

/** Takes a bottle back out of the bay, with its cards and the private note that it was theirs. */
export async function takeBack(uid: string, id: string): Promise<void> {
  const store = firestore();
  const batch = writeBatch(store);
  batch.delete(doc(store, "bottles", id, "deck", "cards"));
  batch.delete(doc(store, "bottles", id));
  batch.delete(doc(store, "users", uid, "shared", id));
  await batch.commit();
}

/** One report per sailor per bottle. Enough reports hide it from everyone. */
export async function reportBottle(uid: string, id: string, reason: BottleReportReason): Promise<void> {
  const store = firestore();
  const batch = writeBatch(store);
  batch.update(doc(store, "bottles", id), { reports: increment(1) });
  batch.set(doc(store, "bottles", id, "reports", uid), { at: serverTimestamp(), reason });
  await batch.commit();
}

/** A deck bottle's cards (kept apart so browsing stays light). */
export async function deckCards(id: string): Promise<BottleCard[]> {
  const snap = await getDoc(doc(firestore(), "bottles", id, "deck", "cards"));
  const cards = snap.data()?.cards;
  return Array.isArray(cards) ? cards.filter((c): c is BottleCard => !!c && typeof c.f === "string" && typeof c.b === "string") : [];
}

/** Plain words for a database error. */
export function bayProblem(e: unknown, action: "load" | "share" | "report" | "take back" | "open"): string {
  const code = String((e as { code?: unknown })?.code ?? "");
  if (code.includes("permission-denied")) {
    if (action === "report") return "You've already reported this bottle.";
    if (action === "share") return "The bay didn't accept that bottle. Wait a few seconds between bottles, and check nothing is too long.";
    return "Bottle Bay isn't open on this database yet: its new rules need publishing (see the setup notes).";
  }
  if (code.includes("unavailable") || /offline|network/i.test(String((e as Error)?.message ?? ""))) return "Couldn't reach the bay. Check your connection and try again.";
  if (code.includes("resource-exhausted")) return "Bottle Bay is out of free database use for today. It catches up tomorrow.";
  return `Couldn't ${action} that: ${e instanceof Error ? e.message : String(e)}`;
}
