// Firebase App & Google Sign-In for Ship (ship-pwedo-pomo).

import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  projectId: "ship-pwedo-pomo",
  appId: "1:52355771001:web:dc70f5f95eb4c5404d42a8",
  storageBucket: "ship-pwedo-pomo.firebasestorage.app",
  apiKey: "AIzaSyCSbkQPLO2gdelJbQU3titvEht6QAZ_-vs",
  authDomain: "ship-pwedo-pomo.firebaseapp.com",
  messagingSenderId: "52355771001",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const { user } = result;
  if (user.displayName) localStorage.setItem("ship:profile-name", user.displayName);
  if (user.email) localStorage.setItem("ship:profile-email", user.email);
  return user;
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuthUser(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}
