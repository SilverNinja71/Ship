// Invite links: …/#room=K7MP2QXA. The code rides in the #fragment, which browsers never send to a
// server. It's taken out of the address bar at once (so it isn't shared again by accident or kept
// in history), and the Study Rooms panel opens on the invite. Nothing joins until the sailor taps.
// A link that doesn't work (cut short by a chat app, or an O typed for a 0) is taken out too, and
// the panel opens on Join with a code, saying what's wrong with it.

import { useEffect } from "react";
import { readInviteLink, withoutInviteHash } from "../lib/roomRules.js";
import { useUi } from "../stores/uiStore.js";

export function useRoomLink(): void {
  useEffect(() => {
    const take = () => {
      const link = readInviteLink(location.hash);
      if (!link) return;
      history.replaceState(null, "", location.pathname + location.search + withoutInviteHash(location.hash));
      if (link.code) useUi.getState().setRoomInvite(link.code);
      else {
        useUi.getState().setRoomInvite(null);
        useUi.getState().setRoomLinkProblem(link.problem);
      }
      useUi.getState().openPanel("rooms");
    };
    take();
    // A link pasted into a tab that already shows Ship changes only the fragment, with no reload.
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, []);
}
