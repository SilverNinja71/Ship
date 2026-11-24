// Checks firestore.rules against Firebase's local emulator, signed in as test sailors
// and as one signed-out visitor, in two parts:
// - Bottle Bay and cloud sync: what may be done, and what must be refused (stealing or
//   deleting someone's bottle, naming the sharer, double reports, dodging the cooldown...).
// - Study Rooms: opening, joining, listing, reports, the skipper's powers, the games and
//   tidying up, and what must be refused (reading a room from outside, fake counts, forged
//   turns, claiming focus minutes that didn't happen...). Old timestamps are made by
//   rewriting them as the database owner, so nothing waits for real minutes to pass.
//
// Start the emulators first (they need Java), from the repo root:
//   npx firebase-tools@15.35.0 emulators:start --only auth,firestore --project demo-ship
// then: npm run check:rules -w @ship/web   (takes about 45 s: it waits out the bottle cooldown once)

const { createHash, randomInt } = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } = require("firebase/auth");
const F = require("firebase/firestore");
const { getFirestore, connectFirestoreEmulator, doc, collection, writeBatch, serverTimestamp, getDocs, getDoc, setDoc, updateDoc, deleteDoc, deleteField, increment, arrayUnion, query, where, orderBy, limit, FieldPath, onSnapshot, setLogLevel } = F;

// A removed sailor's listener is refused on purpose; that isn't worth a console warning.
setLogLevel("silent");

const PROJECT = "demo-ship";
const REST = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

let n = 0;
const apps = [];
async function user(email) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "fake" }, `app${n++}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  let uid = null;
  if (email) {
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
    uid = cred.user.uid;
  }
  return { app, db, uid };
}
const results = [];
let budgetHits = 0;
async function expect(name, shouldPass, fn) {
  let ok = true, code = "", message = "";
  try { await fn(); } catch (e) { ok = false; code = e.code || ""; message = String(e.message || e); }
  const budget = /1,?000 expressions/i.test(message);
  if (budget) budgetHits++;
  // A refusal only counts when the rules gave it; any other error means the check itself went wrong.
  const good = shouldPass ? ok : !ok && code === "permission-denied";
  results.push(good);
  let why = "";
  if (!good) {
    const detail = (code ? code + ": " : "") + message.split("\n").slice(0, 2).join(" ").slice(0, 400);
    why = shouldPass ? `  (expected allowed, got ${detail})` : ok ? "  (expected refused, got allowed)" : `  (expected refused by the rules, got ${detail})`;
  }
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${budget ? "  [hit the 1,000-expression limit]" : ""}${why}`);
}
// Setting up a check: if this fails, the check after it would prove nothing, so stop here.
async function setup(label, fn) {
  try { await fn(); } catch (e) { throw new Error(`setup "${label}" failed: ${e.code || ""} ${e.message || e}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Bottle Bay and cloud sync ----------

const source = (extra = {}) => ({ kind: "source", title: "Krebs cycle explained", url: "https://youtu.be/k", sourceType: "video", subject: "Biology", subjectKey: "biology", tags: ["bio"], description: "Clear video.", cardCount: 0, preview: [], reports: 0, at: serverTimestamp(), ...extra });
async function share(u, bottle, opts = {}) {
  const ref = doc(collection(u.db, "bottles"));
  const b = writeBatch(u.db);
  if (opts.stamp !== false) b.set(doc(u.db, "users", u.uid, "meta", "bottles"), { lastAt: serverTimestamp() });
  if (opts.owner !== false) b.set(doc(u.db, "users", u.uid, "shared", ref.id), { at: serverTimestamp() });
  b.set(ref, bottle);
  if (opts.cards) b.set(doc(u.db, "bottles", ref.id, "deck", "cards"), { cards: opts.cards });
  await b.commit();
  return ref.id;
}

async function bottleBay(alice, bob, carol, nobody) {
  console.log("Bottle Bay and cloud sync");
  let aliceBottle;
  await expect("Alice sets a source bottle afloat", true, async () => { aliceBottle = await share(alice, source()); });
  await expect("Bob browses the bay", true, async () => {
    const snap = await getDocs(query(collection(bob.db, "bottles"), orderBy("at", "desc"), limit(10)));
    const data = snap.docs.find((d) => d.id === aliceBottle).data();
    const text = JSON.stringify(data);
    if (text.includes(alice.uid) || text.includes("alice")) throw new Error("bottle names its sharer");
    if (Object.keys(data).sort().join() !== "at,cardCount,description,kind,preview,reports,sourceType,subject,subjectKey,tags,title,url") throw new Error("unexpected fields " + Object.keys(data));
  });
  await expect("Nobody signed out can browse", false, () => getDocs(collection(nobody.db, "bottles")));
  await expect("Bob can't take back Alice's bottle", false, () => deleteDoc(doc(bob.db, "bottles", aliceBottle)));
  await expect("Bob can't claim Alice's bottle as his", false, () => setDoc(doc(bob.db, "users", bob.uid, "shared", aliceBottle), { at: serverTimestamp() }));
  await expect("Bob can't read Alice's private list", false, () => getDocs(collection(bob.db, "users", alice.uid, "shared")));
  await expect("Alice can't set another bottle afloat within 20 s", false, () => share(alice, source({ title: "Again" })));
  await expect("Alice can't reset her cooldown by deleting it", false, () => deleteDoc(doc(alice.db, "users", alice.uid, "meta", "bottles")));
  await expect("Alice can't rewrite her cooldown stamp", false, () => setDoc(doc(alice.db, "users", alice.uid, "meta", "bottles"), { lastAt: new Date(0) }));
  await expect("A bottle can't carry its sharer's id", false, () => share(carol, source({ owner: carol.uid })));
  await expect("A bottle can't use an http link", false, () => share(carol, source({ url: "http://x.com" })));
  await expect("A bottle can't pick its own time", false, () => share(carol, source({ at: new Date(2020, 0, 1) })));
  await expect("A bottle can't start with reports", false, () => share(carol, source({ reports: 5 })));
  await expect("A bottle needs its sharer's private note", false, () => share(carol, source(), { owner: false }));
  await expect("A bottle needs the cooldown stamp", false, () => share(carol, source(), { stamp: false }));
  await expect("A deck whose card count is wrong is refused", false, () =>
    share(carol, source({ kind: "deck", url: null, sourceType: null, cardCount: 3, preview: [{ f: "a", b: "b" }] }), { cards: [{ f: "a", b: "b" }] }),
  );
  let carolDeck;
  await expect("Carol sets a deck afloat", true, async () => {
    carolDeck = await share(carol, source({ kind: "deck", title: "Cells", url: null, sourceType: null, cardCount: 2, preview: [{ f: "ATP?", b: "Energy" }] }), { cards: [{ f: "ATP?", b: "Energy" }, { f: "DNA?", b: "Genes" }] });
  });
  await expect("Bob opens Carol's deck cards", true, async () => {
    const d = await getDoc(doc(bob.db, "bottles", carolDeck, "deck", "cards"));
    if (d.data().cards.length !== 2) throw new Error("wrong cards");
  });
  await expect("Bob can't add cards to Carol's deck", false, () => setDoc(doc(bob.db, "bottles", carolDeck, "deck", "cards"), { cards: [] }));
  const report = (u, id, by = 1, reason = "spam") => {
    const b = writeBatch(u.db);
    b.update(doc(u.db, "bottles", id), { reports: increment(by) });
    b.set(doc(u.db, "bottles", id, "reports", u.uid), { at: serverTimestamp(), reason });
    return b.commit();
  };
  await expect("Bob reports Alice's bottle", true, () => report(bob, aliceBottle));
  await expect("Bob can't report it twice", false, () => report(bob, aliceBottle));
  await expect("Carol can't add 5 reports at once", false, () => report(carol, aliceBottle, 5));
  await expect("Carol can't report with a made-up reason", false, () => report(carol, aliceBottle, 1, "boring"));
  await expect("Nobody can read who reported", false, () => getDocs(collection(carol.db, "bottles", aliceBottle, "reports")));
  await expect("Bob can't change Alice's title", false, () => setDoc(doc(bob.db, "bottles", aliceBottle), { title: "Spam" }, { merge: true }));
  await expect("Cloud sync still saves Alice's planner", true, () => setDoc(doc(alice.db, "users", alice.uid, "state", "planner"), { json: "{}", version: 1, rev: "r", updatedAt: serverTimestamp() }));
  await expect("Alice can't write other kinds of document in her folder", false, () => setDoc(doc(alice.db, "users", alice.uid, "secrets", "x"), { a: 1 }));
  await expect("Alice takes her bottle back", true, async () => {
    const b = writeBatch(alice.db);
    b.delete(doc(alice.db, "bottles", aliceBottle, "deck", "cards"));
    b.delete(doc(alice.db, "bottles", aliceBottle));
    b.delete(doc(alice.db, "users", alice.uid, "shared", aliceBottle));
    await b.commit();
    if ((await getDoc(doc(bob.db, "bottles", aliceBottle))).exists()) throw new Error("still there");
  });
  console.log("waiting out the 20 s cooldown…");
  await wait(21_000);
  await expect("After 20 s Alice can set another bottle afloat", true, () => share(alice, source({ title: "Second" })));
  await expect("Carol (whose stamp is old) deletes her stamp, as account deletion does", true, () => deleteDoc(doc(carol.db, "users", carol.uid, "meta", "bottles")));
}

// ---------- Study Rooms ----------

const H = (s) => createHash("sha256").update(s).digest("hex");
// Room codes use the app's alphabet (no I, O, 0 or 1). Each run gets fresh codes and fresh
// sailors, so the check can run again on the same emulator.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function roomCode(prefix) {
  const code = prefix + Array.from({ length: 8 - prefix.length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new Error(`bad test room code ${code}`);
  return code;
}
async function sailor(name, run) {
  const u = await user(`${name}.${run}@rooms.test`);
  return { ...u, name, key: (code) => H(u.uid + "/" + code), rep: (code) => H("report/" + u.uid + "/" + code) };
}

// Owner writes skip the rules: they age a timestamp or flip the off switch without waiting.
const OWNER = { authorization: "Bearer owner" };
async function age(pathStr, fieldPath, minutesAgo) {
  const iso = new Date(Date.now() - minutesAgo * 60000).toISOString();
  const segs = fieldPath.split(".");
  let value = { timestampValue: iso };
  for (let i = segs.length - 1; i >= 1; i--) value = { mapValue: { fields: { [segs[i]]: value } } };
  // Backticks, because sailor keys start with digits.
  const mask = segs.map((s) => "`" + s + "`").join(".");
  const res = await fetch(`${REST}/${pathStr}?updateMask.fieldPaths=${encodeURIComponent(mask)}&currentDocument.exists=true`, { method: "PATCH", headers: { ...OWNER, "content-type": "application/json" }, body: JSON.stringify({ fields: { [segs[0]]: value } }) });
  if (!res.ok) throw new Error("age failed " + res.status + " " + (await res.text()).slice(0, 300));
}
async function ownerSet(pathStr, fields) {
  const res = await fetch(`${REST}/${pathStr}`, { method: "PATCH", headers: { ...OWNER, "content-type": "application/json" }, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error("ownerSet failed " + res.status);
}
async function ownerDelete(pathStr) {
  const res = await fetch(`${REST}/${pathStr}`, { method: "DELETE", headers: OWNER });
  if (!res.ok && res.status !== 404) throw new Error("ownerDelete failed " + res.status);
}
const ownerGet = async (pathStr) => (await fetch(`${REST}/${pathStr}`, { headers: OWNER })).json();
const ownerExists = async (pathStr) => (await fetch(`${REST}/${pathStr}`, { headers: OWNER })).ok;

const fresh = (extra = {}) => ({ n: [3, 7, 42], c: 1, a: 0, st: 0, end: null, in: serverTimestamp(), seen: serverTimestamp(), dmg: 0, cr: serverTimestamp(), say: -1, sayAt: null, gid: 0, g: 0, gt: 0, gp: 0, ...extra });
const roomData = (u, code, mode, extra = {}) => ({ v: 1, mode, name: [1, 2], subj: 0, at: serverTimestamp(), host: u.key(code), listed: mode === "open", locked: false, ban: [], rep: [], why: { spam: 0, unkind: 0, personal: 0, off: 0 }, banked: 0, last: null, sail: null, deck: null, game: null, m: { [u.key(code)]: fresh() }, ...extra });
const cardData = (mode, extra = {}) => ({ v: 1, mode, name: [1, 2], subj: 0, at: serverTimestamp(), listed: mode === "open", locked: false, n: 1, alive: serverTimestamp(), ...extra });
const stampRef = (u) => doc(u.db, "users", u.uid, "meta", "rooms");
const acceptRules = (u, over13) => setDoc(stampRef(u), { madeAt: null, joinedAt: null, madeIn: null, joinedIn: null, openIn: null, rules: 1, over13 });
// The stamp a new room writes: the times, and this room's code (an open room's also as openIn).
const openStamp = (code, mode) => ({ madeAt: serverTimestamp(), joinedAt: serverTimestamp(), madeIn: code, joinedIn: code, ...(mode === "open" ? { openIn: code } : {}) });
// The same batches lib/rooms.ts sends. `also` adds more rooms to the same batch, on the same stamp.
async function create(u, code, mode, opts = {}) {
  const b = writeBatch(u.db);
  if (opts.stamp !== false) b.update(stampRef(u), opts.stampData ?? openStamp(code, mode));
  for (const c of [code, ...(opts.also ?? [])]) {
    if (opts.note !== false) b.set(doc(u.db, "users", u.uid, "rooms", c), { at: serverTimestamp() });
    b.set(doc(u.db, "rooms", c), c === code ? (opts.data ?? roomData(u, c, mode)) : roomData(u, c, mode));
    if (opts.card !== false) b.set(doc(u.db, "roomCards", c), c === code ? (opts.cardData ?? cardData(mode)) : cardData(mode));
  }
  await b.commit();
}
const mp = (k, f) => new FieldPath("m", k, ...(f ? [f] : []));
async function join(u, code, opts = {}) {
  const b = writeBatch(u.db);
  if (opts.stamp !== false) b.update(stampRef(u), { joinedAt: serverTimestamp(), joinedIn: opts.stampRoom ?? code });
  for (const c of [code, ...(opts.also ?? [])]) {
    b.update(doc(u.db, "rooms", c), mp(u.key(c)), opts.entry ?? fresh());
    if (opts.card !== false) b.update(doc(u.db, "roomCards", c), { n: increment(opts.by ?? 1) });
    if (opts.note !== false) b.set(doc(u.db, "users", u.uid, "rooms", c), { at: serverTimestamp() });
  }
  await b.commit();
}
const own = (u, code, fields) => {
  const args = [mp(u.key(code), "seen"), serverTimestamp()];
  for (const [k, v] of Object.entries(fields)) args.push(mp(u.key(code), k), v);
  return updateDoc(doc(u.db, "rooms", code), ...args);
};
async function captainWrite(u, code, pairs, card = null) {
  const b = writeBatch(u.db);
  b.update(doc(u.db, "rooms", code), ...pairs, mp(u.key(code), "seen"), serverTimestamp());
  if (card) b.update(doc(u.db, "roomCards", code), card);
  await b.commit();
}
async function removal(u, code, goneKey, dmg, opts = {}) {
  const b = writeBatch(u.db);
  b.update(doc(u.db, "rooms", code), mp(goneKey), deleteField(), "banked", increment(dmg), "last", goneKey, ...(opts.extra ?? []));
  if (opts.card !== false) b.update(doc(u.db, "roomCards", code), { n: increment(-1) });
  if (opts.note) b.delete(doc(u.db, "users", u.uid, "rooms", code));
  await b.commit();
}
async function report(u, code, reason, listed, opts = {}) {
  const b = writeBatch(u.db);
  b.update(doc(u.db, "rooms", code), "rep", arrayUnion(u.rep(code)), new FieldPath("why", reason), increment(opts.by ?? 1), "listed", listed);
  if (opts.card) b.update(doc(u.db, "roomCards", code), { listed });
  await b.commit();
}
const ageSeen = (u, code, mins = 1) => age(`rooms/${code}`, `m.${u.key(code)}.seen`, mins);
const ageJoinStamp = (u) => age(`users/${u.uid}/meta/rooms`, "joinedAt", 1);
const ageStamp = async (u) => {
  await age(`users/${u.uid}/meta/rooms`, "madeAt", 2);
  await age(`users/${u.uid}/meta/rooms`, "joinedAt", 2);
};
const openList = (u, n = 20) => getDocs(query(collection(u.db, "roomCards"), where("listed", "==", true), limit(n)));

async function studyRooms(nobody) {
  console.log("\nStudy Rooms");
  const run = Date.now().toString(36);
  const names = ["alice", "bob", "carol", "dave", "erin", "finn", "gail", "hank", "ivy", "jay"];
  const crew = await Promise.all(names.map((x) => sailor(x, run)));
  const [alice, bob, carol, dave, erin, finn, gail, hank, ivy, jay] = crew;
  const A = roomCode("K7MP"), O = roomCode("BEACH"), D1 = roomCode("DAVE"), D2 = roomCode("DAVE"), J = roomCode("JAY"), HK = roomCode("HANK"), P = roomCode("PEARL");
  const hiddenDeck = `HIDDEN${run}`, goodDeck = `GOODDECK${run}`, otherDeck = `OTHERDECK${run}`;
  // Rooms start switched on (no config/rooms), even if an earlier run stopped halfway.
  await ownerDelete("config/rooms");

  // ---- The rules card and the stamp ----
  for (const u of [alice, bob, carol, erin, finn, gail, hank, ivy, jay]) await setup(`${u.name} accepts the rules`, () => acceptRules(u, true));
  await expect("Dave accepts the rules without the 13+ tick", true, () => acceptRules(dave, false));
  await expect("The stamp can't carry other fields", false, () => setDoc(stampRef(dave), { madeAt: null, joinedAt: null, madeIn: null, joinedIn: null, openIn: null, rules: 1, over13: false, name: "Dave" }));
  await expect("The stamp can't name a room without spending its cooldown", false, () => updateDoc(stampRef(dave), { madeIn: roomCode("ZZ") }));

  // ---- Opening an invite room ----
  await expect("A room needs its public card", false, () => create(alice, A, "invite", { card: false }));
  await expect("A card that miscounts the crew is refused", false, () => create(alice, A, "invite", { cardData: cardData("invite", { n: 2 }) }));
  await expect("A room needs the skipper's private note", false, () => create(alice, A, "invite", { note: false }));
  await expect("A room needs the cooldown stamp", false, () => create(alice, A, "invite", { stamp: false }));
  await expect("A room's stamp must name that room", false, () => create(alice, A, "invite", { stampData: openStamp(roomCode("ZZ"), "invite") }));
  await expect("One batch can't open two rooms on one stamp", false, () => create(alice, A, "invite", { also: [roomCode("ZY")] }));
  await expect("A sailor can't carry a name field", false, () => create(alice, A, "invite", { data: roomData(alice, A, "invite", { m: { [alice.key(A)]: { ...fresh(), name: "Alice Smith" } } }) }));
  await expect("Nickname number 69 is refused", false, () => create(alice, A, "invite", { data: roomData(alice, A, "invite", { m: { [alice.key(A)]: fresh({ n: [3, 7, 69] }) } }) }));
  await expect("Alice opens an invite room (room, card, note, stamp)", true, () => create(alice, A, "invite"));
  await expect("Alice can't open another room within 60 s", false, () => create(alice, roomCode("ZZ"), "invite"));
  await expect("Alice can't delete her stamp during its cooldown", false, () => deleteDoc(stampRef(alice)));
  await expect("Alice can't rewrite her stamp's time", false, () => updateDoc(stampRef(alice), { madeAt: new Date(0) }));
  await expect("Alice (aboard) reads her room", true, () => getDoc(doc(alice.db, "rooms", A)));
  await expect("Bob (not aboard, has the code) can't read the room", false, () => getDoc(doc(bob.db, "rooms", A)));
  await expect("Bob reads the room's public card: 9 fields, no nicknames or keys", true, async () => {
    const d = (await getDoc(doc(bob.db, "roomCards", A))).data();
    if (Object.keys(d).sort().join() !== "alive,at,listed,locked,mode,n,name,subj,v") throw new Error("fields " + Object.keys(d));
    if (JSON.stringify(d).includes(alice.key(A))) throw new Error("card names a key");
  });
  await expect("Bob can't fake the card's count", false, () => updateDoc(doc(bob.db, "roomCards", A), { n: 5 }));
  await expect("Bob can't delete a live room's card", false, () => deleteDoc(doc(bob.db, "roomCards", A)));

  // ---- Joining ----
  await expect("Bob's join without updating the card is refused", false, () => join(bob, A, { card: false }));
  await expect("Bob's join without his join stamp is refused", false, () => join(bob, A, { stamp: false }));
  await expect("Bob can't join with accessory 9", false, () => join(bob, A, { entry: fresh({ a: 9 }) }));
  await expect("Bob's join stamp must name the room", false, () => join(bob, A, { stampRoom: roomCode("ZZ") }));
  await expect("Bob joins by code (room, card +1, stamp, note)", true, () => join(bob, A));
  await expect("Bob now reads the room", true, () => getDoc(doc(bob.db, "rooms", A)));
  await setup("age Bob's join stamp", () => ageJoinStamp(bob));
  await expect("Bob can't join again", false, () => join(bob, A));
  await expect("Dave (no 13+ tick) joins the invite room", true, () => join(dave, A));
  await expect("Bob can't write his entry within 15 s", false, () => own(bob, A, { st: 1 }));
  await setup("age Bob's seen and credit", async () => {
    await ageSeen(bob, A, 2);
    await age(`rooms/${A}`, `m.${bob.key(A)}.cr`, 2);
  });
  await expect("Bob can't claim 5 focus minutes 2 minutes after his last credit", false, () => own(bob, A, { st: 1, dmg: 5, cr: serverTimestamp() }));
  await expect("Bob can't add minutes without stamping cr", false, () => own(bob, A, { st: 1, dmg: 2 }));
  await expect("Bob can't change his look", false, () => own(bob, A, { a: 3 }));
  await expect("Bob cheers and banks 2 minutes", true, () => own(bob, A, { st: 1, dmg: 2, cr: serverTimestamp(), say: 3, sayAt: serverTimestamp() }));

  // ---- Removal, bans, the listener ----
  const seen = { snaps: 0, gone: false, error: null };
  const stop = onSnapshot(doc(bob.db, "rooms", A), (s) => { seen.snaps++; if (s.exists() && !(bob.key(A) in s.data().m)) seen.gone = true; }, (e) => { seen.error = e.code; });
  await wait(800);
  await setup("age Alice's seen", () => ageSeen(alice, A, 1));
  await expect("Alice removes Bob and bans him (minutes banked, card -1)", true, () => removal(alice, A, bob.key(A), 2, { extra: ["ban", [bob.key(A)]] }));
  await wait(1500);
  console.log(`      (observed: Bob's open listener after removal: snapshots=${seen.snaps}, saw himself gone=${seen.gone}, error=${seen.error})`);
  stop();
  await expect("Bob (removed) can't read the room any more", false, () => getDoc(doc(bob.db, "rooms", A)));
  await setup("age Bob's join stamp", () => ageJoinStamp(bob));
  await expect("Bob can't rejoin", false, () => join(bob, A));
  await setup("Carol joins Alice's room", async () => { await ageJoinStamp(carol); await join(carol, A); });
  await expect("Dave can't remove Alice's crewmate (not skipper, not stale)", false, () => removal(dave, A, carol.key(A), 0));
  await setup("age Alice's seen", () => ageSeen(alice, A, 1));
  await expect("The skipper can't sweep a crewmate who's still here (only ask them to leave)", false, () => removal(alice, A, carol.key(A), 0));

  // ---- Open room, list, 13+ ----
  await expect("Dave (no 13+ tick) can't open an open room", false, () => create(dave, D1, "open"));
  await setup("age Dave's join stamp", () => ageJoinStamp(dave));
  await expect("Dave opens an invite room instead", true, () => create(dave, D2, "invite"));
  await setup("age Carol's join stamp", () => ageJoinStamp(carol));
  await expect("Carol (13+) opens an open room", true, () => create(carol, O, "open"));
  await expect("One batch can't join two rooms on one stamp", false, () => join(erin, O, { also: [A] }));
  for (const u of [erin, finn, ivy]) await expect(`${u.name[0].toUpperCase()}${u.name.slice(1)} joins the open room`, true, () => join(u, O));
  const O2 = roomCode("BEACH");
  await setup("age Carol's stamp", () => ageStamp(carol));
  await expect("Carol can't open a second open room while she skippers one", false, () => create(carol, O2, "open"));
  await expect("Carol can't free her open-room slot by naming a made-up room", false, () => updateDoc(stampRef(carol), { madeAt: serverTimestamp(), madeIn: O2, openIn: O2 }));
  await expect("Carol can't delete her stamp while she skippers an open room", false, () => deleteDoc(stampRef(carol)));
  await setup("age Dave's join stamp", () => ageJoinStamp(dave));
  await expect("Dave (no 13+) can't join the open room", false, () => join(dave, O));
  await expect("Gail lists open rooms (limit 20): the open one is there, as a card", true, async () => {
    const s = await openList(gail);
    const mine = s.docs.find((d) => d.id === O);
    if (!mine || mine.data().n !== 4) throw new Error("got " + s.docs.map((d) => d.id + ":" + d.data().n));
    if (s.docs.some((d) => [A, D2].includes(d.id))) throw new Error("an invite room is listed");
  });
  await expect("Dave (no 13+) can't list open rooms", false, () => openList(dave));
  await expect("Listing more than 20 is refused", false, () => openList(gail, 21));
  await expect("Listing without listed == true is refused", false, () => getDocs(query(collection(gail.db, "roomCards"), limit(5))));
  await expect("Listing rooms themselves is refused", false, () => getDocs(query(collection(gail.db, "rooms"), where("listed", "==", true), limit(5))));
  await expect("Gail (not aboard) can't read the open room", false, () => getDoc(doc(gail.db, "rooms", O)));

  // ---- Reports ----
  await expect("Gail (never aboard) can't report", false, () => report(gail, O, "spam", true));
  await expect("Erin (aboard) reports: unkind", true, () => report(erin, O, "unkind", true));
  await expect("Erin can't report twice", false, () => report(erin, O, "spam", true));
  await expect("Ivy can't add two reasons at once", false, () => report(ivy, O, "spam", true, { by: 2 }));
  await setup("age Carol's seen", () => ageSeen(carol, O, 1));
  await expect("Carol removes Finn and bans him", true, () => removal(carol, O, finn.key(O), 0, { extra: ["ban", [finn.key(O)]] }));
  await expect("Finn (removed) can still report: personal", true, () => report(finn, O, "personal", true));
  await expect("A third report that keeps the room listed is refused", false, () => report(ivy, O, "off", true));
  await expect("A third report that unlists the room without its card is refused", false, () => report(ivy, O, "off", false));
  await expect("Ivy's third report unlists the room and its card", true, () => report(ivy, O, "off", false, { card: true }));
  await expect("The unlisted room is gone from the list", true, async () => { const s = await openList(gail); if (s.docs.some((d) => d.id === O)) throw new Error("still listed"); });
  await setup("age Carol's seen", () => ageSeen(carol, O, 1));
  await expect("The skipper can't relist a reported room", false, () => captainWrite(carol, O, ["listed", true, "locked", false], { listed: true }));
  await expect("Locking without telling the card is refused", false, () => captainWrite(carol, O, ["locked", true]));
  await expect("The skipper locks the door (card says locked)", true, () => captainWrite(carol, O, ["locked", true], { locked: true }));

  // ---- Decks ----
  await setup("age Carol's seen; float a hidden deck and a good one", async () => {
    await ageSeen(carol, O, 1);
    await ownerSet(`bottles/${hiddenDeck}`, { kind: { stringValue: "deck" }, reports: { integerValue: "3" }, cardCount: { integerValue: "6" } });
    await ownerSet(`bottles/${goodDeck}`, { kind: { stringValue: "deck" }, reports: { integerValue: "0" }, cardCount: { integerValue: "12" } });
  });
  await expect("Carol can't pick a hidden Bottle Bay deck", false, () => captainWrite(carol, O, ["deck", { b: hiddenDeck, n: 6 }]));
  await expect("Carol can't use her own cards in an open room", false, async () => {
    const b = writeBatch(carol.db);
    b.set(doc(carol.db, "rooms", O, "deck", "cards"), { cards: [{ f: "a", b: "1" }, { f: "b", b: "2" }, { f: "c", b: "3" }, { f: "d", b: "4" }] });
    b.update(doc(carol.db, "rooms", O), "deck", { b: null, n: 4 }, mp(carol.key(O), "seen"), serverTimestamp());
    await b.commit();
  });
  await expect("Carol picks an unreported Bottle Bay deck", true, () => captainWrite(carol, O, ["deck", { b: goodDeck, n: 12 }]));
  await setup("age Carol's seen", () => ageSeen(carol, O, 1));
  await expect("A game can't seat someone who isn't aboard", false, () => captainWrite(carol, O, ["game", { kind: "tidy", v: 1, seed: 7, at: serverTimestamp(), seats: [carol.key(O), gail.key(O)] }]));
  await expect("Carol starts Tidy the Deck with the crew aboard", true, () => captainWrite(carol, O, ["game", { kind: "tidy", v: 1, seed: 7, at: serverTimestamp(), seats: [carol.key(O), erin.key(O), ivy.key(O)] }]));
  await setup("age Erin's seen", () => ageSeen(erin, O, 1));
  await expect("Erin reports her patch cleared", true, () => own(erin, O, { gid: 7, g: 2, gt: 41000, gp: 2 }));
  const deckFields = (reports, cards) => ({ kind: { stringValue: "deck" }, reports: { integerValue: String(reports) }, cardCount: { integerValue: String(cards) } });
  await setup("age Carol's seen; float another deck", async () => {
    await ageSeen(carol, O, 1);
    await ownerSet(`bottles/${otherDeck}`, deckFields(0, 8));
  });
  await expect("The deck can't change while a game is on", false, () => captainWrite(carol, O, ["deck", { b: otherDeck, n: 8 }]));
  await setup("Bottle Bay hides the game's deck after a third report", () => ownerSet(`bottles/${goodDeck}`, deckFields(3, 12)));
  await expect("A new game can't be dealt from a deck that reports have since hidden", false, () => captainWrite(carol, O, ["game", { kind: "tidy", v: 1, seed: 8, at: serverTimestamp(), seats: [carol.key(O)] }]));
  await expect("Putting the game away and picking another deck in one write is fine", true, () => captainWrite(carol, O, ["game", null, "deck", { b: otherDeck, n: 8 }]));
  await setup("age Carol's seen", () => ageSeen(carol, O, 1));
  await expect("…and a game from that deck starts", true, () => captainWrite(carol, O, ["game", { kind: "tidy", v: 1, seed: 9, at: serverTimestamp(), seats: [carol.key(O), erin.key(O)] }]));

  // ---- Pass the Bottle in the invite room, with field-path turns ----
  await setup("age Alice's seen", () => ageSeen(alice, A, 1));
  await expect("Alice packs her own 4-card deck for the invite room", true, async () => {
    const b = writeBatch(alice.db);
    b.set(doc(alice.db, "rooms", A, "deck", "cards"), { cards: [{ f: "a", b: "1" }, { f: "b", b: "2" }, { f: "c", b: "3" }, { f: "d", b: "4" }] });
    b.update(doc(alice.db, "rooms", A), "deck", { b: null, n: 4 }, mp(alice.key(A), "seen"), serverTimestamp());
    await b.commit();
  });
  await expect("Dave (aboard) reads the room deck", true, () => getDoc(doc(dave.db, "rooms", A, "deck", "cards")));
  await expect("Gail (not aboard) can't read the room deck", false, () => getDoc(doc(gail.db, "rooms", A, "deck", "cards")));
  await setup("age Alice's seen", () => ageSeen(alice, A, 1));
  const seats = [alice.key(A), dave.key(A), carol.key(A)];
  const bottle = (extra = {}) => ({ kind: "bottle", v: 1, seed: 99, at: serverTimestamp(), seats, n: 4, turn: 0, holder: seats[0], tAt: serverTimestamp(), card: 0, del: 0, buoys: 5, res: false, goal: 3, end: 0, ...extra });
  await expect("A bottle game can't deal more cards than the deck holds", false, () => captainWrite(alice, A, ["game", bottle({ n: 5 })]));
  await expect("A bottle game's goal can't be more than the cards it deals", false, () => captainWrite(alice, A, ["game", bottle({ goal: 5 })]));
  await expect("Alice starts Pass the Bottle", true, () => captainWrite(alice, A, ["game", bottle()]));
  await expect("The skipper's own cards can't be swapped while a game is on", false, () =>
    setDoc(doc(alice.db, "rooms", A, "deck", "cards"), { cards: [{ f: "w", b: "5" }, { f: "x", b: "6" }, { f: "y", b: "7" }, { f: "z", b: "8" }] }),
  );
  await wait(2200);
  const gp = (f) => new FieldPath("game", f);
  // A turn as lib/rooms.ts playTurn sends it: field paths under game.*, no read first.
  const t = (u, ch) => { const args = [gp("tAt"), serverTimestamp()]; for (const [k, v] of Object.entries(ch)) args.push(gp(k), v); return updateDoc(doc(u.db, "rooms", A), ...args); };
  await expect("Dave (not holder) can't take Alice's turn yet", false, () => t(dave, { turn: 1, holder: seats[1], card: 1, del: 1 }));
  await expect("Gail (not aboard) can't play", false, () => t(gail, { turn: 1, holder: seats[1], card: 1, del: 1 }));
  await expect("A turn can't slip in another game field", false, () => t(alice, { turn: 1, holder: seats[1], card: 1, del: 1, goal: 1 }));
  await expect("Alice delivers and passes the bottle to Dave (field-path update)", true, () => t(alice, { turn: 1, holder: seats[1], card: 1, del: 1 }));
  await expect("A second write of the same turn is refused (no transaction needed)", false, () => t(alice, { turn: 1, holder: seats[1], card: 1, del: 1 }));
  await wait(2200);
  await setup("age Dave's seen", () => ageSeen(dave, A, 1));
  await expect("Dave starts focusing", true, () => own(dave, A, { st: 1 }));
  await expect("Dave is focusing, so Carol takes the helm at once (a miss: rescue)", true, () => t(carol, { turn: 2, holder: seats[2], res: true }));
  await wait(2200);
  await expect("Carol can't deliver two at once", false, () => t(carol, { turn: 3, holder: seats[0], card: 2, del: 3, res: false }));
  await expect("Ending as won before the goal is refused", false, () => t(carol, { turn: 3, holder: seats[0], card: 2, del: 2, res: false, end: 1 }));
  await expect("Carol saves the rescue", true, () => t(carol, { turn: 3, holder: seats[0], card: 2, del: 2, res: false }));
  await wait(2200);
  await expect("Alice delivers the third: the island, end = 1", true, () => t(alice, { turn: 4, holder: seats[1], card: 3, del: 3, end: 1 }));
  await wait(2200);
  await expect("No turns after the end", false, () => t(dave, { turn: 5, holder: seats[2], card: 4, del: 3 }));

  // ---- The hat, stale sailors, dead rooms ----
  await setup("age Alice's seen by 30 min", () => age(`rooms/${A}`, `m.${alice.key(A)}.seen`, 30));
  await expect("Nobody joins while the skipper is gone", false, () => join(hank, A));
  await expect("Sweeping the stale skipper without handing on the hat is refused", false, () => removal(dave, A, alice.key(A), 0));
  await setup("age Carol's seen", () => ageSeen(carol, A, 1));
  await expect("Carol takes the hat (stamping her entry)", true, () => updateDoc(doc(carol.db, "rooms", A), "host", carol.key(A), mp(carol.key(A), "seen"), serverTimestamp()));
  await expect("Carol (skipper) sweeps away Alice, minutes banked", true, () => removal(carol, A, alice.key(A), 0));
  await setup("age Carol's seen", () => ageSeen(carol, A, 1));
  await expect("Carol refreshes the card's alive with her keep-alive", true, async () => {
    const b = writeBatch(carol.db);
    b.update(doc(carol.db, "rooms", A), mp(carol.key(A), "seen"), serverTimestamp());
    b.update(doc(carol.db, "roomCards", A), { alive: serverTimestamp() });
    await b.commit();
  });
  await expect("A stranger can't set the card's alive to a made-up time", false, () => updateDoc(doc(gail.db, "roomCards", A), { alive: new Date() }));
  await setup("age Carol's seen by 30 min", () => age(`rooms/${A}`, `m.${carol.key(A)}.seen`, 30));
  await expect("Gail (outside) clears the dead room, its deck and card in one batch", true, async () => {
    const b = writeBatch(gail.db);
    b.delete(doc(gail.db, "rooms", A, "deck", "cards"));
    b.delete(doc(gail.db, "rooms", A));
    b.delete(doc(gail.db, "roomCards", A));
    await b.commit();
    for (const p of [`rooms/${A}`, `roomCards/${A}`, `rooms/${A}/deck/cards`]) if (await ownerExists(p)) throw new Error(p + " is still there");
  });
  await expect("Gail can't delete Dave's live room", false, () => deleteDoc(doc(gail.db, "rooms", D2)));
  await expect("Dave, last one out, closes his room with its card and note", true, async () => {
    const b = writeBatch(dave.db);
    b.delete(doc(dave.db, "rooms", D2));
    b.delete(doc(dave.db, "roomCards", D2));
    b.delete(doc(dave.db, "users", dave.uid, "rooms", D2));
    await b.commit();
  });
  await expect("A private note needs a room-code id", false, () => setDoc(doc(dave.db, "users", dave.uid, "rooms", "lower123"), { at: serverTimestamp() }));

  // ---- Leaving by yourself ----
  await setup("age Ivy's seen and credit by 3 min", async () => {
    await ageSeen(ivy, O, 3);
    await age(`rooms/${O}`, `m.${ivy.key(O)}.cr`, 3);
  });
  await expect("Ivy can't bank 10 extra minutes as she leaves after 3", false, () => removal(ivy, O, ivy.key(O), 10, { note: true }));
  await expect("Ivy leaves, banking 2 minutes she hadn't written yet", true, () => removal(ivy, O, ivy.key(O), 2, { note: true }));

  // ---- Off switch, stamps, signed out ----
  await setup("switch room creation off", () => ownerSet("config/rooms", { create: { booleanValue: false } }));
  await expect("With the off switch on, Jay can't open a room", false, () => create(jay, J, "invite"));
  await setup("pause open rooms", () => ownerSet("config/rooms", { create: { booleanValue: true }, open: { booleanValue: false } }));
  await expect("With open rooms paused, the list is refused", false, () => openList(gail));
  await expect("With open rooms paused, Hank can't open an open room", false, () => create(hank, HK, "open"));
  await expect("…but Jay can open an invite room", true, () => create(jay, J, "invite"));
  await setup("age Alice's stamp", async () => {
    await age(`users/${alice.uid}/meta/rooms`, "madeAt", 2);
    await age(`users/${alice.uid}/meta/rooms`, "joinedAt", 2);
  });
  await expect("Alice deletes her stamp once both cooldowns are over (account deletion)", true, () => deleteDoc(stampRef(alice)));
  await expect("Signed-out visitors can't read a card", false, () => getDoc(doc(nobody.db, "roomCards", O)));
  await expect("Bottle Bay's rules are unchanged: Gail still can't read who reported", false, () => getDocs(collection(gail.db, "bottles", goodDeck, "reports")));

  // ---- More skipper checks on a fresh open room ----
  await setup("switch open rooms back on", () => ownerSet("config/rooms", { create: { booleanValue: true }, open: { booleanValue: true } }));
  await expect("Hank opens an open room", true, () => create(hank, P, "open"));
  await setup("age Hank's seen", () => ageSeen(hank, P, 1));
  await expect("Locking an open room without unlisting its card is refused", false, () => captainWrite(hank, P, ["locked", true, "listed", false]));
  await expect("Hank locks the door and the card leaves the list (refreshing the card's alive too)", true, () => captainWrite(hank, P, ["locked", true, "listed", false], { listed: false, locked: true, alive: serverTimestamp() }));
  await expect("A skipper write within 15 s is refused", false, () => captainWrite(hank, P, ["locked", false, "listed", true], { listed: true, locked: false }));
  await setup("age Hank's seen", () => ageSeen(hank, P, 1));
  await expect("Hank unlocks and relists", true, () => captainWrite(hank, P, ["locked", false, "listed", true], { listed: true, locked: false }));
  await setup("age Hank's seen", () => ageSeen(hank, P, 1));
  await expect("An open room can't become an invite room", false, () => captainWrite(hank, P, ["mode", "invite", "listed", false], { listed: false }));
  await expect("Setting sail for 9 legs is refused", false, () => captainWrite(hank, P, ["sail", { at: serverTimestamp(), f: 25, b: 5, c: 9 }]));
  await expect("A 0-minute break is refused", false, () => captainWrite(hank, P, ["sail", { at: serverTimestamp(), f: 25, b: 0, c: 2 }]));
  await expect("Hank sets sail together: 25/5 x 8", true, () => captainWrite(hank, P, ["sail", { at: serverTimestamp(), f: 25, b: 5, c: 8 }]));
  await setup("age Gail's join stamp", () => ageJoinStamp(gail));
  await expect("Gail joins Hank's room", true, () => join(gail, P));
  await setup("age Gail's seen", () => ageSeen(gail, P, 1));
  await expect("Gail (not skipper) can't set sail", false, () => captainWrite(gail, P, ["sail", { at: serverTimestamp(), f: 25, b: 5, c: 2 }]));
  await expect("Gail can't take the hat while Hank is here", false, () => updateDoc(doc(gail.db, "rooms", P), "host", gail.key(P), mp(gail.key(P), "seen"), serverTimestamp()));
  await setup("age Hank's seen", () => ageSeen(hank, P, 1));
  await expect("Hank passes the hat to Gail", true, () => captainWrite(hank, P, ["host", gail.key(P)]));
  const P2 = roomCode("PEARL");
  await setup("age Hank's stamp", () => ageStamp(hank));
  await expect("Hank, no longer its skipper, can open another open room", true, () => create(hank, P2, "open"));
  await setup("age Jay's join stamp and seen", async () => { await ageJoinStamp(jay); await ageSeen(jay, J, 1); });
  await expect("Jay can't list his invite room", false, () => captainWrite(jay, J, ["listed", true], { listed: true }));

  // ---- No card is ever left on the list without its room ----
  await expect("Jay packs his own 4-card deck", true, async () => {
    const b = writeBatch(jay.db);
    b.set(doc(jay.db, "rooms", J, "deck", "cards"), { cards: [{ f: "a", b: "1" }, { f: "b", b: "2" }, { f: "c", b: "3" }, { f: "d", b: "4" }] });
    b.update(doc(jay.db, "rooms", J), "deck", { b: null, n: 4 }, mp(jay.key(J), "seen"), serverTimestamp());
    await b.commit();
  });
  await expect("The skipper can't delete a room and keep its card (a ghost on the open list)", false, () => deleteDoc(doc(jay.db, "rooms", J)));
  await expect("…or delete it with its card but not its deck", false, async () => {
    const b = writeBatch(jay.db);
    b.delete(doc(jay.db, "rooms", J));
    b.delete(doc(jay.db, "roomCards", J));
    await b.commit();
  });
  await expect("Jay closes his room with its card, deck and note", true, async () => {
    const b = writeBatch(jay.db);
    b.delete(doc(jay.db, "rooms", J, "deck", "cards"));
    b.delete(doc(jay.db, "rooms", J));
    b.delete(doc(jay.db, "roomCards", J));
    b.delete(doc(jay.db, "users", jay.uid, "rooms", J));
    await b.commit();
    for (const p of [`rooms/${J}`, `roomCards/${J}`, `rooms/${J}/deck/cards`]) if (await ownerExists(p)) throw new Error(p + " is still there");
  });
  const G = roomCode("GHST");
  await setup("leave a card and a deck whose room is gone (as an older app could)", async () => {
    const now = { timestampValue: new Date().toISOString() };
    await ownerSet(`roomCards/${G}`, { v: { integerValue: "1" }, mode: { stringValue: "open" }, name: { arrayValue: { values: [{ integerValue: "1" }, { integerValue: "2" }] } }, subj: { integerValue: "0" }, at: now, listed: { booleanValue: true }, locked: { booleanValue: false }, n: { integerValue: "1" }, alive: now });
    await ownerSet(`rooms/${G}/deck/cards`, { cards: { arrayValue: { values: [] } } });
  });
  await expect("Anyone clears a leftover card and deck with the app's tidy-up batch", true, async () => {
    const b = writeBatch(gail.db);
    b.delete(doc(gail.db, "rooms", G, "deck", "cards"));
    b.delete(doc(gail.db, "rooms", G));
    b.delete(doc(gail.db, "roomCards", G));
    await b.commit();
    for (const p of [`roomCards/${G}`, `rooms/${G}/deck/cards`]) if (await ownerExists(p)) throw new Error(p + " is still there");
  });

  const dump = JSON.stringify(await ownerGet(`rooms/${O}`)) + JSON.stringify(await ownerGet(`roomCards/${O}`)) + JSON.stringify(await ownerGet(`rooms/${P}`));
  await expect("No account id or email appears in any room or card document", true, async () => {
    for (const u of crew) if (dump.includes(u.uid) || dump.includes(`${u.name}.${run}`)) throw new Error("found " + u.name);
  });

  // ---- Account deletion (lib/cloudSync.ts deleteCloudData) takes back a sailor's bottles ----
  // Each bottle (and its deck cards) costs one lookup of the sharer's private note, and a batch
  // may make at most 20, so deleteCloudData sends 10 bottles per batch.
  const kim = await sailor("kim", run);
  crew.push(kim);
  const ids = Array.from({ length: 25 }, () => doc(collection(kim.db, "bottles")).id);
  await setup("float 25 of Kim's bottles", () => Promise.all(ids.flatMap((id) => [
    ownerSet(`bottles/${id}`, { kind: { stringValue: "deck" }, reports: { integerValue: "0" }, cardCount: { integerValue: "4" } }),
    ownerSet(`bottles/${id}/deck/cards`, { cards: { arrayValue: { values: [] } } }),
    ownerSet(`users/${kim.uid}/shared/${id}`, { at: { timestampValue: new Date().toISOString() } }),
  ])));
  const takeBack = async (u, some) => {
    const b = writeBatch(u.db);
    for (const id of some) {
      b.delete(doc(u.db, "bottles", id, "deck", "cards"));
      b.delete(doc(u.db, "bottles", id));
    }
    await b.commit();
  };
  await expect("Account deletion can't take back 21 bottles in one batch (over the lookup limit)", false, () => takeBack(kim, ids.slice(0, 21)));
  await expect("It takes back 25 bottles in batches of 10, 10 and 5", true, async () => {
    for (let i = 0; i < ids.length; i += 10) await takeBack(kim, ids.slice(i, i + 10));
    for (const id of ids) if (await ownerExists(`bottles/${id}`)) throw new Error("bottle still there");
  });

  // Leave the emulator as it was found: rooms switched on, and no rooms of this run on the list.
  await ownerDelete("config/rooms");
  for (const c of [O, P, P2, J]) for (const p of [`rooms/${c}/deck/cards`, `rooms/${c}`, `roomCards/${c}`]) await ownerDelete(p);
  for (const id of [hiddenDeck, goodDeck, otherDeck]) await ownerDelete(`bottles/${id}`);
}

(async () => {
  const [alice, bob, carol, nobody] = await Promise.all([user("alice@test.dev"), user("bob@test.dev"), user("carol@test.dev"), user(null)]);
  await bottleBay(alice, bob, carol, nobody);
  await studyRooms(nobody);
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  console.log(budgetHits ? `${budgetHits} refusals hit the 1,000-expression limit: a rule must stay under it` : "No refusal hit the 1,000-expression limit");
  await Promise.all(apps.map((a) => deleteApp(a)));
  process.exit(passed === results.length && budgetHits === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
