/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to use Firebase's local emulators for sign-in and cloud sync (see lib/firebase.ts). */
  readonly VITE_FIREBASE_EMULATORS?: string;
}
