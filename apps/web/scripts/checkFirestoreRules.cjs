// Checks firestore.rules against Firebase's local emulator, as three
// signed-in sailors and one signed-out visitor: what Bottle Bay and cloud sync
// may do, and what must be refused (stealing or deleting someone's bottle,
// naming the sharer, double reports, dodging the cooldown...).
//
// Start the emulators first (they need Java), from the repo root:
//   npx firebase-tools@15.35.0 emulators:start --only auth,firestore --project demo-ship
// then: npm run check:rules -w @ship/web   (takes about 25 s: it waits out the cooldown once)

const { initializeApp, deleteApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } = require("firebase/auth");
const F = require("firebase/firestore");
const { getFirestore, connectFirestoreEmulator, doc, collection, writeBatch, serverTimestamp, getDocs, getDoc, setDoc, deleteDoc, increment, query, orderBy, limit } = F;

let n = 0;
async function user(email) {
  const app = initializeApp({ projectId: "demo-ship", apiKey: "fake" }, `app${n++}`);
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
async function expect(name, shouldPass, fn) {
  let ok = true, err = "";
  try { await fn(); } catch (e) { ok = false; err = e.code || e.message; }
  const good = ok === shouldPass;
  results.push(good);
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good ? "" : `  (expected ${shouldPass ? "allowed" : "refused"}, got ${ok ? "allowed" : err})`}`);
}
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const [alice, bob, carol, nobody] = await Promise.all([user("alice@test.dev"), user("bob@test.dev"), user("carol@test.dev"), user(null)]);
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
  console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
  await Promise.all([alice, bob, carol, nobody].map((u) => deleteApp(u.app)));
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
