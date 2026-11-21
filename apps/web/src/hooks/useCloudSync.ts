// Starts cloud sync when someone signs in and stops it when they sign out.
// The sync code (and Firestore with it) loads only for signed-in sailors.

import { useEffect } from "react";
import { subscribeAuthUser } from "../lib/firebase.js";

type SyncModule = typeof import("../lib/cloudSync.js");
let loaded: Promise<SyncModule> | null = null;
const syncModule = () => (loaded ??= import("../lib/cloudSync.js"));

export function useCloudSync(): void {
  useEffect(
    () =>
      subscribeAuthUser((user) => {
        if (user) void syncModule().then((m) => m.startSync(user.uid));
        else if (loaded) void loaded.then((m) => m.stopSync());
      }),
    [],
  );
}

/** For the Log in window's "Try again" and "Choose what to keep" buttons. */
export function retryCloudSync(): void {
  void syncModule().then((m) => m.retrySync());
}
