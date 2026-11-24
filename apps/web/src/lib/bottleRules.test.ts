import { describe, expect, it } from "vitest";
import { BOTTLE_LIMITS } from "@ship/shared-types";
import { bottleNoteMarkdown, checkDraft, cleanShareUrl, cleanTags, hasContactDetails, personalInfoWarnings, sourceTypeOf, visibleBottles } from "./bottleRules.js";

describe("cleaning links before they go in a bottle", () => {
  it("removes tracking codes and the code that points back at the sharer", () => {
    const r = cleanShareUrl("https://youtu.be/abc123?si=SHARER&t=42&utm_source=ig");
    expect(r).toEqual({ ok: true, url: "https://youtu.be/abc123?t=42", removed: ["si", "utm_source"] });
    expect(cleanShareUrl("https://example.edu/notes?si=keep&fbclid=x")).toMatchObject({ ok: true, url: "https://example.edu/notes?si=keep" });
  });

  it("only takes plain https links", () => {
    expect(cleanShareUrl("http://example.com")).toMatchObject({ ok: false });
    expect(cleanShareUrl("javascript:alert(1)")).toMatchObject({ ok: false });
    expect(cleanShareUrl("https://me:secret@example.com")).toMatchObject({ ok: false });
    expect(cleanShareUrl("not a link")).toMatchObject({ ok: false });
  });

  it("sorts sources by what they are", () => {
    expect(sourceTypeOf("https://www.youtube.com/watch?v=x")).toBe("video");
    expect(sourceTypeOf("https://school.edu/handout.PDF")).toBe("pdf");
    expect(sourceTypeOf("https://en.wikipedia.org/wiki/Cell")).toBe("article");
    expect(sourceTypeOf("https://www.khanacademy.org/science")).toBe("website");
  });
});

describe("spotting personal details", () => {
  it("warns about emails, phone numbers, addresses, names and personal cloud files", () => {
    expect(personalInfoWarnings(["Ask me at ana@school.edu"], null)).toHaveLength(1);
    expect(personalInfoWarnings(["Call 555-123-4567"], null)).toHaveLength(1);
    expect(personalInfoWarnings(["Meet at 12 Oak Street"], null)).toHaveLength(1);
    expect(personalInfoWarnings(["Hi, my name is Ana Lopez"], null)).toHaveLength(1);
    expect(personalInfoWarnings([], "https://docs.google.com/document/d/abc/edit")).toHaveLength(1);
    expect(personalInfoWarnings(["Cells make ATP in 1953 and 2026"], "https://en.wikipedia.org/wiki/Cell")).toEqual([]);
  });
});

describe("spotting contact details (Study Rooms blocks these in a skipper's deck)", () => {
  const contact = (text: string) => hasContactDetails([text]);

  it("finds social and chat apps, as whole words", () => {
    for (const text of ["follow my insta", "it's on Instagram", "snapchat me", "my TikTok", "message on WhatsApp"]) expect(contact(text), text).toHaveLength(1);
    expect(contact("Discordant harmony resolves to a consonance")).toEqual([]);
    expect(contact("Instantly, the Tiktaalik crawled ashore")).toEqual([]);
  });

  it("counts everyday words like discord, telegram and snap only when they point at an account", () => {
    for (const text of ["add my discord", "on Telegram @sunny", "my snap is sunny22", "Discord username: sunny", "join our discord server"]) expect(contact(text).length, text).toBeGreaterThan(0);
    for (const text of ["The Apple of Discord started the Trojan War", "The Zimmermann Telegram: a 1917 message", "A snap election was called", "Snap is the fourth derivative of position"])
      expect(contact(text), text).toEqual([]);
  });

  it("finds requests to get in touch", () => {
    for (const text of ["add me!", "DM me after class", "text me later"]) expect(contact(text), text).toEqual(["It asks people to get in touch (like \"add me\" or \"DM me\")."]);
    expect(contact("Add meat to the stew")).toEqual([]);
  });

  it("finds @usernames, but not the @ in an email or in code", () => {
    expect(contact("find me @sunny_otter")).toEqual(["It has something that looks like a username (@name)."]);
    expect(contact("(@pip.draws)")).toHaveLength(1);
    expect(contact("Write to them at help@example.com")).toEqual([]);
    expect(contact("What does @Override do? And @staticmethod? @media (max-width: 40em)? @app.route('/')?")).toEqual([]);
  });

  it("finds invite and profile links", () => {
    for (const text of ["discord.gg/abc123", "https://discord.com/invite/abc", "https://t.me/sunny", "wa.me/15551234567", "https://chat.whatsapp.com/Ab12", "snapchat.com/add/sunny", "instagram.com/sunny.otter"])
      expect(contact(text).some((w) => w.includes("invite or profile link")), text).toBe(true);
    expect(contact("What.me worry?")).toEqual([]);
  });

  it("finds real emails and phone numbers, but not examples or numbers from a lesson", () => {
    expect(contact("ana@school.edu")).toEqual(["It has an email address in it."]);
    expect(contact("Email format: name@example.com")).toEqual([]);
    for (const text of ["555-123-4567", "(555) 123-4567", "+44 7700 900123", "call me on 5551234567", "07700900123", "555.123.4567"]) expect(contact(text), text).toEqual(["It has something that looks like a phone number."]);
    for (const text of ["e = 1.602176634 x 10^-19 C", "pi is 3.14159265358979", "Integer.MAX_VALUE is 2147483647", "2^32 = 4294967296", "One billion: 1 000 000 000", "ISBN 978-3-16-148410-0", "Signed 1918 and 1919"])
      expect(contact(text), text).toEqual([]);
  });

  it("gives nothing for a clean deck", () => {
    expect(hasContactDetails(["Mitochondria", "Makes ATP", "Krebs cycle", "In the matrix", "1066", "Battle of Hastings"])).toEqual([]);
  });

  it("warns about the same things in Bottle Bay, including the link itself", () => {
    expect(personalInfoWarnings(["add me on discord"], null)).toHaveLength(2);
    expect(personalInfoWarnings([], "https://discord.gg/abc123")).toEqual(["It has an invite or profile link for a chat or social app."]);
  });
});

describe("making a bottle from a draft", () => {
  it("makes a clean source bottle", () => {
    const r = checkDraft({ kind: "source", title: "  Krebs cycle   explained ", url: "https://youtu.be/k?si=me", subject: " Biology ", tags: "bio, #Unit-2 bio", description: "Clear 8-minute video." });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bottle).toEqual({
      kind: "source",
      title: "Krebs cycle explained",
      url: "https://youtu.be/k",
      sourceType: "video",
      subject: "Biology",
      subjectKey: "biology",
      tags: ["bio", "unit-2"],
      description: "Clear 8-minute video.",
      cardCount: 0,
      preview: [],
      reports: 0,
    });
    expect(r.removedParams).toEqual(["si"]);
  });

  it("makes a deck bottle with a preview, dropping half-empty cards", () => {
    const cards = [{ front: "ATP?", back: "Energy" }, { front: "", back: "x" }, ...Array.from({ length: 5 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` }))];
    const r = checkDraft({ kind: "deck", title: "Cells", subject: "Bio", tags: [], description: "", cards });
    expect(r.ok && r.bottle.cardCount).toBe(6);
    expect(r.ok && r.bottle.preview).toHaveLength(BOTTLE_LIMITS.preview);
    expect(r.ok && r.bottle.url).toBeNull();
  });

  it("says what to fix", () => {
    const r = checkDraft({ kind: "source", title: "", url: "http://x.com", subject: "", tags: "", description: "x".repeat(600) });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems).toHaveLength(3);
    expect(checkDraft({ kind: "deck", title: "Empty", subject: "", tags: "", description: "", cards: [] }).ok).toBe(false);
  });

  it("keeps tags short and few", () => {
    expect(cleanTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(BOTTLE_LIMITS.tags);
  });
});

describe("browsing", () => {
  it("hides bottles with too many reports and shows the newest first", () => {
    const list = visibleBottles([
      { id: "a", reports: 0, at: 1 },
      { id: "b", reports: BOTTLE_LIMITS.hideAtReports, at: 3 },
      { id: "c", reports: 1, at: 2 },
    ]);
    expect(list.map((b) => b.id)).toEqual(["c", "a"]);
  });

  it("turns a source into a note that says where it came from", () => {
    const md = bottleNoteMarkdown({ title: "Cells", url: "https://x.edu/c", description: "Good.", tags: ["bio"], subject: "Biology" });
    expect(md).toContain("[Open the source](https://x.edu/c)");
    expect(md).toContain("> [!info] From Bottle Bay");
    expect(md).toContain("#bio");
  });
});
