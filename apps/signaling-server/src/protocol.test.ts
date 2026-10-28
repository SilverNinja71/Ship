import { describe, expect, it } from "vitest";
import { cleanText, normalizeRoomName, parseClientMessage } from "./protocol.js";

const avatar = {
  name: "Ada",
  skin: "honey",
  hair: "bob",
  hairColor: "#5A3A22",
  hat: "straw-hat",
  coat: "striped-shirt",
  coatColor: "#C2524A",
  accessory: "none",
  tool: "quill-logbook",
};
const member = { name: "Ada", avatar, shipId: "woolly-wanderer", state: "SAILING_FOCUS", focusMinutesToday: 12, audio: false, video: true };

function parse(message: unknown) {
  return parseClientMessage(JSON.stringify(message));
}

describe("normalizeRoomName", () => {
  it("lowercases and trims", () => {
    expect(normalizeRoomName("  Study-Crew-7 ")).toBe("study-crew-7");
  });

  it.each(["", "-crew", "crew-", "two words", "crew!", "ü-boat", "a".repeat(33), 42, null])("refuses %j", (name) => {
    expect(normalizeRoomName(name)).toBeNull();
  });
});

describe("cleanText", () => {
  it("drops control and bidi characters and collapses whitespace", () => {
    expect(cleanText("  Ahoy\n\tthere\u202eevil\u0000! ")).toBe("Ahoy there evil !");
  });

  it("keeps emoji intact", () => {
    expect(cleanText("👩\u200d🚀 ahoy")).toBe("👩\u200d🚀 ahoy");
  });
});

describe("parseClientMessage", () => {
  it("accepts a join and drops fields the server owns", () => {
    const result = parse({ t: "join", room: "Deck", member: { ...member, seat: 3, peerId: "me", joinedAt: 1 } });
    expect(result).toEqual({ ok: true, message: { t: "join", room: "deck", member } });
  });

  it("refuses a join with a missing or bad field", () => {
    const { video: _video, ...noVideo } = member;
    expect(parse({ t: "join", room: "deck", member: noVideo })).toMatchObject({ ok: false, reason: "member.video is missing" });
    expect(parse({ t: "join", room: "deck", member: { ...member, state: "NAPPING" } }).ok).toBe(false);
    expect(parse({ t: "join", room: "deck", member: { ...member, name: "   " } }).ok).toBe(false);
    expect(parse({ t: "join", room: "deck", member: { ...member, avatar: { ...avatar, hairColor: "url(x)" } } }).ok).toBe(false);
    expect(parse({ t: "join", room: "deck", member: { ...member, avatar: { ...avatar, hat: "<script>" } } }).ok).toBe(false);
    expect(parse({ t: "join", room: "bad room", member }).ok).toBe(false);
  });

  it("validates presence patches field by field", () => {
    expect(parse({ t: "presence", patch: { state: "DRIFTING_IDLE", seat: 0 } })).toEqual({
      ok: true,
      message: { t: "presence", patch: { state: "DRIFTING_IDLE" } },
    });
    expect(parse({ t: "presence", patch: { seat: 0 } })).toMatchObject({ ok: false, reason: "patch has nothing to change" });
    expect(parse({ t: "presence", patch: { name: "x".repeat(33) } }).ok).toBe(false);
    expect(parse({ t: "presence", patch: { focusMinutesToday: -1 } }).ok).toBe(false);
    expect(parse({ t: "presence", patch: { audio: "yes" } }).ok).toBe(false);
    expect(parse({ t: "presence", patch: [] }).ok).toBe(false);
  });

  it("refuses focus ticks that aren't positive finite numbers", () => {
    expect(parse({ t: "focus-tick", minutes: 1.5 })).toEqual({ ok: true, message: { t: "focus-tick", minutes: 1.5 } });
    for (const minutes of [0, -2, "5", null]) expect(parse({ t: "focus-tick", minutes }).ok).toBe(false);
    expect(parseClientMessage('{"t":"focus-tick","minutes":1e400}').ok).toBe(false); // JSON.parse gives Infinity
  });

  it("rebuilds signals from known fields", () => {
    const ice = { candidate: "candidate:1 1 udp 2122260223 10.0.0.2 51234 typ host", sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "abc" };
    expect(parse({ t: "signal", to: "p2", from: "spoofed", data: { kind: "ice", candidate: ice } })).toEqual({
      ok: true,
      message: { t: "signal", to: "p2", data: { kind: "ice", candidate: { candidate: ice.candidate, sdpMid: "0", sdpMLineIndex: 0 } } },
    });
    expect(parse({ t: "signal", to: "p2", data: { kind: "offer", sdp: "v=0", type: "offer" } })).toEqual({
      ok: true,
      message: { t: "signal", to: "p2", data: { kind: "offer", sdp: "v=0" } },
    });
    expect(parse({ t: "signal", to: "p2", data: { kind: "renegotiate" } }).ok).toBe(false);
    expect(parse({ t: "signal", to: "p2", data: { kind: "answer", sdp: "x".repeat(60_000) } }).ok).toBe(false);
    expect(parse({ t: "signal", to: "", data: { kind: "answer", sdp: "v=0" } }).ok).toBe(false);
  });

  it("trims and caps shouts at 280 characters", () => {
    const result = parse({ t: "shout", text: `  ${"🦜".repeat(300)}  ` });
    expect(result.ok && result.message.t === "shout" && Array.from(result.message.text).length).toBe(280);
    expect(parse({ t: "shout", text: " \n " }).ok).toBe(false);
  });

  it("refuses bad JSON, unknown types and oversized frames", () => {
    expect(parseClientMessage("{nope")).toEqual({ ok: false, reason: "message is not valid JSON" });
    expect(parse({ t: "mutiny" })).toEqual({ ok: false, reason: "unknown message type" });
    expect(parse(["ping"]).ok).toBe(false);
    expect(parse({ t: "shout", text: "x".repeat(70_000) })).toEqual({ ok: false, reason: "message is too big" });
  });
});
