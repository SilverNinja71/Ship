// Study Rooms: study side by side with friends (invite rooms) or anyone 13+ (open rooms), on the
// public website with no server of its own. Everyone gets a made-up name and character in each
// room; there's no typed chat. Loaded only when opened, since it brings Firestore with it.
//
// It shows the first that applies: log in, a notice (removed, drifted, closed), the room rules,
// a room waiting to be joined (invite link, code or the list), the room you're in, or the tabs.

import { useEffect, useState } from "react";
import { ROOM_RULES_VERSION } from "@ship/shared-types";
import type { RoomCard, RoomLook } from "@ship/shared-types";
import { useAuthUser } from "../../hooks/useAuthUser.js";
import { randomLook } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { IconCrew } from "../icons.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { Aboard } from "../rooms/Aboard.js";
import { JoinByCode } from "../rooms/JoinByCode.js";
import { JoinCard } from "../rooms/JoinCard.js";
import { OpenRooms } from "../rooms/OpenRooms.js";
import { RoomNoticeCard } from "../rooms/RoomNoticeCard.js";
import { RoomRulesCard } from "../rooms/RoomRulesCard.js";
import { YELLOW_BUTTON } from "../rooms/roomStyle.js";
import { StartRoom } from "../rooms/StartRoom.js";
import { Panel, Tabs } from "../ui.js";

type RoomsTab = "open" | "code" | "start";

export function RoomsPanel({ onClose }: { onClose: () => void }) {
  const user = useAuthUser();
  const invite = useUi((s) => s.roomInvite);
  const notice = useRooms((s) => s.notice);
  const rulesOk = useRooms((s) => s.rulesOk);
  const current = useRooms((s) => s.current);
  const joining = useRooms((s) => s.status === "joining");
  const [preview, setPreview] = useState<{ code: string; card?: RoomCard; refusal?: string } | null>(null);
  const [showRules, setShowRules] = useState(false);
  // Until the sailor picks a tab, the open list is the start for 13+ sailors (also right after
  // ticking 13+ on the rules card), and the code box for everyone else.
  const over13 = useRooms((s) => s.over13);
  const [picked, setTab] = useState<RoomsTab | null>(null);
  const tab = picked ?? (over13 ? "open" : "code");
  // The look last used in a room comes back (the store saves it on opening or joining).
  const [look, setLook] = useState<RoomLook>(() => useRooms.getState().myLook ?? randomLook(Math.random));
  const pending = preview?.code ?? invite;
  const clearPending = () => {
    setPreview(null);
    if (useUi.getState().roomInvite) useUi.getState().setRoomInvite(null);
  };

  // An invite to the room you're already in needs no Join card.
  useEffect(() => {
    if (invite && invite === current) useUi.getState().setRoomInvite(null);
  }, [invite, current]);

  let body: React.ReactNode;
  if (!user) {
    body = <SignedOut invited={!!invite} />;
  } else if (notice) {
    body = <RoomNoticeCard notice={notice} onStart={() => setTab("start")} onRejoin={(code, refusal) => setPreview({ code, refusal })} />;
  } else if (rulesOk < ROOM_RULES_VERSION || showRules) {
    body = <RoomRulesCard onDone={() => setShowRules(false)} />;
  } else if (pending && pending !== current) {
    body = (
      <JoinCard
        key={pending}
        code={pending}
        card={preview?.card}
        refusal={preview?.refusal}
        look={look}
        onLook={setLook}
        onJoined={clearPending}
        onCancel={clearPending}
        onRules={() => setShowRules(true)}
      />
    );
  } else if (current || joining) {
    body = <Aboard />;
  } else {
    body = (
      <>
        <Tabs
          tone="pastel"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "open", label: "Open rooms" },
            { id: "code", label: "Join with a code" },
            { id: "start", label: "Start a room" },
          ]}
        />
        {tab === "open" && <OpenRooms onBoard={(card) => setPreview({ code: card.code, card })} onRules={() => setShowRules(true)} onStart={() => setTab("start")} />}
        {tab === "code" && <JoinByCode onFind={(code) => setPreview({ code })} />}
        {tab === "start" && <StartRoom look={look} onLook={setLook} onRules={() => setShowRules(true)} />}
      </>
    );
  }

  return (
    <Panel title="Study Rooms" subtitle="Study side by side · nobody sees your real name" icon={<IconCrew />} onClose={onClose} wide>
      {body}
    </Panel>
  );
}

function SignedOut({ invited }: { invited: boolean }) {
  return (
    <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-[var(--border-subtle)] px-6 py-10 text-center">
      <PastelMinionBadge costume="bunny" size={76} />
      <p className="font-display text-xl">{invited ? "You've been invited to a study room" : "Log in to study with a crew"}</p>
      <p className="max-w-md text-sm text-[var(--muted-ink)]">
        {invited ? "Log in to see it. " : ""}Rooms keep your Google name and email hidden. You'll get a made-up sailor name in every room.
      </p>
      <button type="button" onClick={() => useUi.getState().setLoginOpen(true)} className={YELLOW_BUTTON}>
        Log in
      </button>
    </div>
  );
}
