// Bottle Bay's database side (Firestore). Each action writes everything it
// touches in one batch, because the rules in firestore.rules check the pieces
// together: a bottle goes out with its sharer's private "this is mine" note
// and cooldown stamp (which names it), and a report goes out with its +1 and
// the reporter's own report stamp (one report every 30 s, naming the bottle).
// The third report hides a bottle for good (`hidden`, and a deck's cards go):
// the rules then let only its sharer read it, and the bay lists only bottles
// that aren't hidden.
// Taking a bottle back empties it to {gone: true} for good rather than
// deleting it, so its id can never carry other cards later. Loaded only when
// the Bottle Bay panel opens.

import { collection, doc, getDoc, getDocFromServer, getDocs, increment, limit, orderBy, query, serverTimestamp, startAfter, where, writeBatch } from "firebase/firestore";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { BOTTLE_LIMITS } from "@ship/shared-types";
import type { Bottle, BottleCard, BottleKind, BottleReportReason, BottleSourceType } from "@ship/shared-types";
import type { BottleData } from "./bottleRules.js";
import { firestore } from "./db.js";

const PAGE = 40;
const SOURCE_TYPES = new Set<unknown>(["website", "video", "pdf", "article", "book", "other"]);

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const millis = (v: unknown) => (v && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as { toMillis(): number }).toMillis() : Date.now());
const millisOrNull = (v: unknown) => (v && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as { toMillis(): number }).toMillis() : null);

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
    // A hidden bottle counts as fully reported, whatever its count says.
    reports: d.hidden === true ? Math.max(BOTTLE_LIMITS.hideAtReports, typeof d.reports === "number" ? d.reports : 0) : typeof d.reports === "number" ? d.reports : 0,
  };
}

export interface BottlePage {
  bottles: Bottle[];
  /** Pass back to load the next page; null when there's no more. */
  cursor: QueryDocumentSnapshot | null;
}

/** The newest bottles, or every bottle on one subject. */
export async function listBottles(opts: { subjectKey?: string; kind?: BottleKind; after?: QueryDocumentSnapshot | null } = {}): Promise<BottlePage> {
  const store = firestore();
  const bottles = collection(store, "bottles");
  // Only bottles that reports haven't hidden: the rules refuse a list that could include one.
  const shown = where("hidden", "==", false);
  // A subject is looked up on its own (sorted here), which needs no extra database index; so is a
  // subject and a kind together ("==" filters only can use the single-field indexes). The newest
  // bottles need one composite index (hidden, then at newest first: firestore.indexes.json).
  const q = opts.subjectKey
    ? query(bottles, where("subjectKey", "==", opts.subjectKey), ...(opts.kind ? [where("kind", "==", opts.kind)] : []), shown, limit(PAGE * 2))
    : query(bottles, shown, orderBy("at", "desc"), ...(opts.after ? [startAfter(opts.after)] : []), limit(PAGE));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => toBottle(d.id, d.data())).filter((b): b is Bottle => b !== null);
  return { bottles: list, cursor: !opts.subjectKey && snap.docs.length === PAGE ? snap.docs[snap.docs.length - 1]! : null };
}

/** Sets a bottle afloat. Its id is random, and nothing in it names the sharer. The cooldown stamp names it, so one stamp sets one bottle afloat. */
export async function setAfloat(uid: string, bottle: BottleData, cards: readonly BottleCard[]): Promise<string> {
  const store = firestore();
  const ref = doc(collection(store, "bottles"));
  const batch = writeBatch(store);
  batch.set(doc(store, "users", uid, "meta", "bottles"), { lastAt: serverTimestamp(), lastId: ref.id });
  batch.set(doc(store, "users", uid, "shared", ref.id), { at: serverTimestamp() });
  batch.set(ref, { ...bottle, hidden: false, at: serverTimestamp() });
  if (bottle.kind === "deck") batch.set(doc(store, "bottles", ref.id, "deck", "cards"), { cards: cards.map((c) => ({ f: c.f, b: c.b })) });
  await batch.commit();
  return ref.id;
}

/** The bottles this sailor set afloat, from their private list (hidden ones too: the rules let their sharer read them). */
export async function myBottles(uid: string): Promise<Bottle[]> {
  const store = firestore();
  const shared = await getDocs(collection(store, "users", uid, "shared"));
  const docs = await Promise.all(shared.docs.map((d) => getDoc(doc(store, "bottles", d.id))));
  return docs.map((d) => (d.exists() ? toBottle(d.id, d.data()) : null)).filter((b): b is Bottle => b !== null).sort((a, b) => b.at - a.at);
}

/** What a bottle becomes when its sharer takes it back: empty, for good (the rules never let it be set afloat again). */
export const TAKEN_BACK = { gone: true } as const;

/** Takes a bottle back out of the bay: its cards go, it empties to {gone: true}, and the private note that it was theirs goes. */
export async function takeBack(uid: string, id: string): Promise<void> {
  const store = firestore();
  const batch = writeBatch(store);
  batch.delete(doc(store, "bottles", id, "deck", "cards"));
  batch.set(doc(store, "bottles", id), TAKEN_BACK);
  batch.delete(doc(store, "users", uid, "shared", id));
  await batch.commit();
}

/** Thrown by reportBottle while this account's last report is under 30 seconds old. */
export class ReportTooSoon extends Error {
  readonly code = "report-too-soon";
  constructor(readonly waitSeconds: number) {
    super(`Wait ${waitSeconds} seconds before reporting another bottle.`);
  }
}

/** Thrown by reportBottle when the bottle isn't in the bay any more (taken back, or already hidden). */
export class BottleGone extends Error {
  readonly code = "bottle-gone";
  constructor() {
    super("That bottle isn't in the bay any more.");
  }
}

/** Seconds left on this account's report cooldown by this device's clock (0 when it's over), from the report stamp's time. */
export function reportWait(lastAt: number | null, now: number): number {
  if (lastAt === null) return 0;
  const left = lastAt + BOTTLE_LIMITS.reportCooldownSeconds * 1000 - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/**
 * The batch that reports a bottle, as the rules want it: +1 report, this sailor's report record,
 * and their report stamp naming the bottle. The third report also hides it (`hidden`), and a
 * hidden deck's cards go in the same batch, so nothing in it can be read any more.
 */
export function reportWrites(bottle: { reports: number; kind: string }): { hidden: boolean; dropCards: boolean } {
  const hidden = bottle.reports + 1 >= BOTTLE_LIMITS.hideAtReports;
  return { hidden, dropCards: hidden && bottle.kind === "deck" };
}

/**
 * One report per sailor per bottle, one every 30 seconds per account. The bottle is read fresh
 * first (the third report hides it, so the batch must know the count); if another report lands
 * in between, it's read again and sent once more.
 */
export async function reportBottle(uid: string, id: string, reason: BottleReportReason): Promise<void> {
  const store = firestore();
  const stampRef = doc(store, "users", uid, "meta", "reports");
  const lastAt = millisOrNull((await getDoc(stampRef).catch(() => null))?.data()?.at);
  const wait = reportWait(lastAt, Date.now());
  if (wait > 0) throw new ReportTooSoon(wait);
  const send = async () => {
    let d: DocumentData | undefined;
    try {
      d = (await getDocFromServer(doc(store, "bottles", id))).data();
    } catch (e) {
      // Only its sharer can read a hidden bottle.
      if (String((e as { code?: unknown })?.code ?? "").includes("permission-denied")) throw new BottleGone();
      throw e;
    }
    if (!d || (d.kind !== "source" && d.kind !== "deck") || typeof d.reports !== "number" || d.reports >= BOTTLE_LIMITS.hideAtReports) throw new BottleGone();
    const { hidden, dropCards } = reportWrites({ reports: d.reports, kind: d.kind });
    const batch = writeBatch(store);
    batch.update(doc(store, "bottles", id), { reports: increment(1), hidden });
    batch.set(doc(store, "bottles", id, "reports", uid), { at: serverTimestamp(), reason });
    batch.set(stampRef, { at: serverTimestamp(), id });
    if (dropCards) batch.delete(doc(store, "bottles", id, "deck", "cards"));
    await batch.commit();
  };
  try {
    await send();
  } catch (e) {
    // Refused: another report may have landed since the read (the count moved), so read it once more.
    if (!String((e as { code?: unknown })?.code ?? "").includes("permission-denied")) throw e;
    await send();
  }
}

/** Whether a deck bottle is still in the bay: not taken back, and not hidden by reports. Read fresh, never from a list. A hidden one can't be read at all (unless it's yours). */
export async function bottleStillShared(id: string): Promise<boolean> {
  let d: DocumentData | undefined;
  try {
    d = (await getDoc(doc(firestore(), "bottles", id))).data();
  } catch (e) {
    if (String((e as { code?: unknown })?.code ?? "").includes("permission-denied")) return false;
    throw e;
  }
  return d?.kind === "deck" && typeof d.reports === "number" && d.reports < BOTTLE_LIMITS.hideAtReports && d.hidden !== true;
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
  if (e instanceof ReportTooSoon || e instanceof BottleGone) return e.message;
  if (code.includes("failed-precondition") && action === "load") return "Bottle Bay's search is still being set up on this database. Try again in a few minutes.";
  if (code.includes("permission-denied")) {
    if (action === "report") return "You've already reported this bottle, or reported another one less than 30 seconds ago.";
    if (action === "share") return "The bay didn't accept that bottle. Wait a few seconds between bottles, and check nothing is too long.";
    return "Bottle Bay isn't open on this database yet: its new rules need publishing (see the setup notes).";
  }
  if (code.includes("unavailable") || /offline|network/i.test(String((e as Error)?.message ?? ""))) return "Couldn't reach the bay. Check your connection and try again.";
  if (code.includes("resource-exhausted")) return "Bottle Bay is out of free database use for today. It catches up tomorrow.";
  return `Couldn't ${action} that: ${e instanceof Error ? e.message : String(e)}`;
}
