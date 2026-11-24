// The Firestore database, made the first time something needs it. Shared by
// cloud sync and Bottle Bay, which are both loaded only when used, so
// Firestore's code stays out of the first download.

import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { app, firebaseEmulators } from "./firebase.js";

let db: Firestore | null = null;

export function firestore(): Firestore {
  if (!db) {
    db = getFirestore(app);
    if (firebaseEmulators) connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  return db;
}
