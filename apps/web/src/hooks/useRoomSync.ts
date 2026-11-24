// Keeps the Study Room session running while a sailor is signed in and aboard, and stops it when
// they sign out. Like useCloudSync, the room code (and Firestore with it) loads only when needed.

import { useEffect } from "react";
import { subscribeAuthUser } from "../lib/firebase.js";
import { useRooms } from "../stores/roomStore.js";
import { useUi } from "../stores/uiStore.js";

type SessionModule = typeof import("../lib/roomSession.js");
let loaded: Promise<SessionModule> | null = null;
const sessionModule = () => (loaded ??= import("../lib/roomSession.js"));

/** Tidying old room notes reads the database, so it runs at most this often however often the panel opens. */
const TIDY_EVERY_MS = 5 * 60_000;

export function useRoomSync(): void {
  useEffect(() => {
    let uid: string | null = null;
    let tidiedAt = 0;

    const follow = () => {
      const code = useRooms.getState().current;
      const who = uid;
      if (who && code) {
        void sessionModule().then((m) => m.startRoomSession(who, code));
        return;
      }
      if (loaded) void loaded.then((m) => m.stopRoomSession());
      // Signed out while aboard: the room stays remembered (logging back in picks it up), but nothing live shows.
      if (!who && useRooms.getState().room) useRooms.setState({ room: null, myKey: null, status: "idle", offer: null, deck: null });
    };

    const tidy = () => {
      const who = uid;
      if (!who || Date.now() - tidiedAt < TIDY_EVERY_MS) return;
      tidiedAt = Date.now();
      void import("../lib/rooms.js")
        .then((m) => m.tidyMyRooms(who, useRooms.getState().current))
        .catch((e: unknown) => console.warn("Ship couldn't tidy old study rooms.", e));
    };

    const unAuth = subscribeAuthUser((user) => {
      const was = uid;
      uid = user?.uid ?? null;
      // Someone who logged in to answer an invite goes straight back to it (never joined by itself).
      if (uid && !was && useUi.getState().roomInvite) {
        useUi.getState().setLoginOpen(false);
        useUi.getState().openPanel("rooms");
      }
      if (uid && useUi.getState().panel === "rooms") tidy();
      follow();
    });
    const unRooms = useRooms.subscribe((s, prev) => {
      if (s.current !== prev.current) follow();
    });
    const unUi = useUi.subscribe((s, prev) => {
      if (s.panel === "rooms" && prev.panel !== "rooms") tidy();
    });
    return () => {
      unAuth();
      unRooms();
      unUi();
    };
  }, []);
}
