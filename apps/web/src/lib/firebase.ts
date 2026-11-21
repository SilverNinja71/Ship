// Firebase App & Google Sign-In for Ship (ship-pwedo-pomo).

import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { saveLocalProfile } from "./accountData.js";

/**
 * `VITE_FIREBASE_EMULATORS=1 npm run dev` points sign-in and cloud sync at
 * Firebase's local emulators (`npx firebase-tools emulators:start`) and a
 * made-up "demo-ship" project instead of the real one, for testing. Real
 * builds never set it.
 */
export const firebaseEmulators = Boolean(import.meta.env.VITE_FIREBASE_EMULATORS);

const firebaseConfig = {
  projectId: firebaseEmulators ? "demo-ship" : "ship-pwedo-pomo",
  appId: "1:52355771001:web:dc70f5f95eb4c5404d42a8",
  storageBucket: "ship-pwedo-pomo.firebasestorage.app",
  apiKey: "AIzaSyCSbkQPLO2gdelJbQU3titvEht6QAZ_-vs",
  authDomain: "ship-pwedo-pomo.firebaseapp.com",
  messagingSenderId: "52355771001",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

if (firebaseEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  // Lets a browser test sign in as anyone without Google's popup. Only emulator builds have it.
  (window as unknown as { __shipEmulatorSignIn: (email: string) => Promise<unknown> }).__shipEmulatorSignIn = (email) =>
    signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name: email.split("@")[0] })));
}
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const { user } = result;
  saveLocalProfile(user.displayName ?? "", user.email ?? "");
  return user;
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuthUser(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}
