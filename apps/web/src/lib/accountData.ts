// Centralized persistence, consent, tutorial state, and full account/data deletion.
// Keeps direct browser storage access and Firebase user deletion out of React components.

import { deleteUser, signOut } from "firebase/auth";
import { clearNotes } from "./noteVault.js";
import { clearSessionKeys } from "./storage.js";
import { forgetVaultHandle } from "./obsidianVault.js";
import { auth } from "./firebase.js";

export const TUTORIAL_SEEN_KEY = "ship:tutorial-seen";
export const SIGNIN_PROMPT_DISMISSED_KEY = "ship:signin-prompt-dismissed";
export const PROFILE_NAME_KEY = "ship:profile-name";
export const PROFILE_EMAIL_KEY = "ship:profile-email";
export const COOKIE_CONSENT_KEY = "ship:storage-consent";

function safeGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota / privacy mode errors cleanly.
  }
}

export function getSavedProfile(): { name: string; email: string } {
  return {
    name: safeGet(PROFILE_NAME_KEY) ?? "",
    email: safeGet(PROFILE_EMAIL_KEY) ?? "",
  };
}

export function saveLocalProfile(name: string, email: string): void {
  if (name.trim()) safeSet(PROFILE_NAME_KEY, name.trim());
  if (email.trim()) safeSet(PROFILE_EMAIL_KEY, email.trim());
}

export function hasSeenTutorial(): boolean {
  return safeGet(TUTORIAL_SEEN_KEY) === "1";
}

export function markTutorialSeen(): void {
  safeSet(TUTORIAL_SEEN_KEY, "1");
}

export function isSignInPromptDismissed(): boolean {
  return safeGet(SIGNIN_PROMPT_DISMISSED_KEY) === "1";
}

export function dismissSignInPromptStorage(): void {
  safeSet(SIGNIN_PROMPT_DISMISSED_KEY, "1");
}

/** Returns true if the visitor's browser is broadcasting Global Privacy Control (GPC). */
export function isGpcEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function getConsentState(): "accepted" | "essential-only" | null {
  const val = safeGet(COOKIE_CONSENT_KEY);
  if (val === "accepted" || val === "essential-only") return val;
  if (isGpcEnabled()) return "essential-only";
  return null;
}

export function setConsentState(choice: "accepted" | "essential-only"): void {
  safeSet(COOKIE_CONSENT_KEY, choice);
}

/**
 * Removes all Ship data: the account's cloud copy, the local `ship:*` keys and
 * the IndexedDB `ship-notes` store, then deletes or signs out the Firebase user.
 * Throws, having deleted nothing, when the cloud copy couldn't be removed.
 */
export async function deleteAllUserData(): Promise<{ wasSignedIn: boolean; deletedFirebaseAccount: boolean }> {
  let deletedFirebaseAccount = false;
  const user = auth.currentUser;
  if (user) {
    // The cloud copy goes first: once the account is deleted, nobody could reach that data to delete it.
    const { deleteCloudData } = await import("./cloudSync.js");
    await deleteCloudData(user.uid);
    try {
      await deleteUser(user);
      deletedFirebaseAccount = true;
    } catch {
      // Recent sign-in may be required for account deletion; still sign out cleanly.
      await signOut(auth).catch(() => undefined);
    }
  }

  try {
    if (typeof localStorage !== "undefined") {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("ship:")) keysToRemove.push(key);
      }
      for (const k of keysToRemove) localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage cleanup errors.
  }
  // This tab's sessionStorage too (a study room's uncredited minutes and Tidy the Deck memory).
  clearSessionKeys();

  await clearNotes().catch(() => undefined);
  await forgetVaultHandle().catch(() => undefined);
  return { wasSignedIn: user !== null, deletedFirebaseAccount };
}
