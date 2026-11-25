// Study Rooms: study side by side with friends (invite rooms) or anyone 13+ (open rooms), on the
// public website with no server of its own. Everyone gets a made-up name and character in each
// room; there's no typed chat. Loaded only when opened, since it brings Firestore with it.
//
// It shows the first that applies: log in, a notice (removed, drifted, closed), the room rules,
// a room waiting to be joined (invite link, code or the list), the room you're in, or the tabs.

import { useEffect, useRef, useState } from "react";
import { ROOM_RULES_VERSION } from "@ship/shared-types";
import type { RoomCard, RoomLook } from "@ship/shared-types";
import { useAuthUser } from "../../hooks/useAuthUser.js";
import { lookFor, useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { IconCrew } from "../icons.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { Aboard } from "../rooms/Aboard.js";
import { JoinByCode } from "../rooms/JoinByCode.js";
import { JoinCard } from "../rooms/JoinCard.js";
import { OpenRooms } from "../rooms/OpenRooms.js";
import { RoomNoticeCard } from "../rooms/RoomNoticeCard.js";
import { RoomRulesCard } from "../rooms/RoomRulesCard.js";
import { YELLOW_BUTTON, useFocusKeeper } from "../rooms/roomStyle.js";
import { StartRoom } from "../rooms/StartRoom.js";
import { Panel, Tabs } from "../ui.js";

type RoomsTab = "open" | "code" | "start";

export function RoomsPanel({ onClose }: { onClose: () => void }) {
  const user = useAuthUser();
  const invite = useUi((s) => s.roomInvite);
  const inviteRefusal = useUi((s) => s.roomInviteRefusal);
  // An invite link that didn't work: the panel opens on Join with a code, saying why.
  const linkProblem = useUi((s) => s.roomLinkProblem);
  const notice = useRooms((s) => s.notice);
  const prefsUid = useRooms((s) => s.uid);
  const rulesOk = useRooms((s) => s.rulesOk);
  const current = useRooms((s) => s.current);
  const joining = useRooms((s) => s.status === "joining");
  const [preview, setPreview] = useState<{ code: string; card?: RoomCard; refusal?: string } | null>(null);
  const [showRules, setShowRules] = useState(false);
  // Until the sailor picks a tab, the open list is the start for 13+ sailors (also right after
  // ticking 13+ on the rules card), and the code box for everyone else.
  const over13 = useRooms((s) => s.over13);
  const [picked, setTab] = useState<RoomsTab | null>(null);
  // When what had the keyboard goes away (a cheer sent, a deck picked, a game started, a pair
  // cleared, a room hidden), the focus moves to the nearest thing still there, never to the page.
  const keeper = useRef<HTMLDivElement>(null);
  useFocusKeeper(keeper);
  const tab = picked ?? (linkProblem || !over13 ? "code" : "open");
  const pending = preview?.code ?? invite;
  // A new nickname for every room (the character and accessory last chosen come back); hopping
  // back into a room keeps the nickname used there.
  const [look, setLook] = useState<RoomLook>(() => lookFor(pending ?? null));
  useEffect(() => {
    setLook(lookFor(pending ?? null));
  }, [pending, current]);

  // The rules answer (and the 13+ tick) is the signed-in account's own, read from it, never this browser's.
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (uid) void useRooms.getState().syncRules();
  }, [uid]);
  const clearPending = () => {
    setPreview(null);
    if (useUi.getState().roomInvite) useUi.getState().setRoomInvite(null);
  };

  // The note after leaving a room (with its Report button) belongs to this visit to the panel (a
  // broken link's problem too: uiStore drops it when the panel closes).
  useEffect(
    () => () => {
      if (useRooms.getState().notice === "left") useRooms.getState().dismissNotice();
    },
    [],
  );

  // An invite to the room you're already in needs no Join card.
  useEffect(() => {
    if (invite && invite === current) useUi.getState().setRoomInvite(null);
  }, [invite, current]);

  let body: React.ReactNode;
  // Whether the Join-with-a-code box shows (it says what's wrong with a broken link itself).
  let codeBox = false;
  if (!user) {
    body = <SignedOut invited={!!invite} linkProblem={linkProblem} />;
  } else if (notice) {
    body = <RoomNoticeCard notice={notice} onStart={() => setTab("start")} onRejoin={(code, refusal) => setPreview({ code, refusal })} />;
  } else if (showRules || ((rulesOk < ROOM_RULES_VERSION || prefsUid !== user.uid) && !current && !joining)) {
    // Not while aboard: coming aboard needed the rules, and an older copy of the answer (from
    // another tab) must never swap the crew for the rules card.
    body = <RoomRulesCard onDone={() => setShowRules(false)} />;
  } else if (pending && pending !== current) {
    body = (
      <JoinCard
        key={pending}
        code={pending}
        card={preview?.card}
        refusal={preview?.refusal ?? (pending === invite ? inviteRefusal : null)}
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
    codeBox = tab === "code";
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
        {tab === "code" && (
          <JoinByCode
            linkProblem={linkProblem}
            onFind={(code) => {
              useUi.getState().setRoomLinkProblem(null);
              setPreview({ code });
            }}
          />
        )}
        {tab === "start" && <StartRoom look={look} onLook={setLook} onRules={() => setShowRules(true)} />}
      </>
    );
  }

  return (
    <Panel title="Study Rooms" subtitle="Study side by side · nobody sees your real name" icon={<IconCrew />} onClose={onClose} wide opener="rooms">
      <div ref={keeper}>
        {/* A broken invite link, while something else comes first (the room rules, a note from Lumi): said at the top. */}
        {linkProblem && user && !codeBox && (
          <p role="alert" className="mb-3 rounded-2xl bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31]">
            {linkProblem}
          </p>
        )}
        {body}
      </div>
    </Panel>
  );
}

function SignedOut({ invited, linkProblem }: { invited: boolean; linkProblem: string | null }) {
  return (
    <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-[var(--border-subtle)] px-6 py-10 text-center">
      <PastelMinionBadge costume="bunny" size={76} />
      <p className="font-display text-xl">{invited ? "You've been invited to a study room" : "Log in to study with a crew"}</p>
      {linkProblem && (
        <p role="alert" className="max-w-md rounded-2xl bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31]">
          {linkProblem}
        </p>
      )}
      <p className="max-w-md text-sm text-[var(--muted-ink)]">
        {invited ? "Log in to see it. " : ""}Rooms keep your Google name and email hidden. You'll get a made-up sailor name in every room.
      </p>
      <button type="button" onClick={() => useUi.getState().setLoginOpen(true)} className={YELLOW_BUTTON}>
        Log in
      </button>
    </div>
  );
}
