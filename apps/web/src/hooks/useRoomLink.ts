// Invite links: …/#room=K7MP2QXA. The code rides in the #fragment, which browsers never send to a
// server. It's taken out of the address bar at once (so it isn't shared again by accident or kept
// in history), and the Study Rooms panel opens on the invite. Nothing joins until the sailor taps.

import { useEffect } from "react";
import { parseInviteHash, withoutInviteHash } from "../lib/roomRules.js";
import { useUi } from "../stores/uiStore.js";

export function useRoomLink(): void {
  useEffect(() => {
    const take = () => {
      const code = parseInviteHash(location.hash);
      if (!code) return;
      history.replaceState(null, "", location.pathname + location.search + withoutInviteHash(location.hash));
      useUi.getState().setRoomInvite(code);
      useUi.getState().openPanel("rooms");
    };
    take();
    // A link pasted into a tab that already shows Ship changes only the fragment, with no reload.
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, []);
}
