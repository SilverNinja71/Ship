// Study Rooms: studying together on the public website through Firestore, with no server.
// A room is one document, rooms/{code}, that only the sailors aboard can read; its public card,
// roomCards/{code}, holds only its made-up name, subject and how many are aboard. Nothing here
// is a name, email or account id: each sailor is a per-room key (sha256 of uid + "/" + code),
// nicknames and looks are indices into the lists below (append-only: the database stores
// indices), and there's no typed chat. firestore.rules mirrors ROOM_LIMITS by hand
// (apps/web/src/lib/roomLimits.test.ts checks they agree).

export type RoomMode = "invite" | "open";
/** 0 in port (docked or preparing), 1 focusing, 2 on a break, 3 paused. */
export type RoomState = 0 | 1 | 2 | 3;
export type RoomReportReason = "spam" | "unkind" | "personal" | "off";
export const ROOM_REPORT_REASONS: readonly RoomReportReason[] = ["spam", "unkind", "personal", "off"];

/** 32 letters and digits with no I, O, 0 or 1; the rules use [A-HJ-NP-Z2-9]{8}. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Bumped when the room rules card changes, so it shows again. */
export const ROOM_RULES_VERSION = 1;
/** Bumped when a game's dealing changes; a device on an older bundle sits that game out. */
export const ROOM_GAME_ENGINE = 1;

export const ROOM_LIMITS = {
  size: 6,
  codeLength: 8,
  writeGapSeconds: 15,
  keepAliveMinutes: 10,
  awayMinutes: 12,
  staleMinutes: 25,
  lifetimeHours: 12,
  createCooldownSeconds: 60,
  joinCooldownSeconds: 10,
  listPage: 20,
  hideAtReports: 3,
  maxBans: 20,
  maxReports: 20,
  wordList: 64,
  subjects: 40,
  costumes: 5,
  accessories: 8,
  nickNumberMax: 99,
  creditSlackSeconds: 60,
  deckCards: { min: 4, max: 100 },
  sailFocus: { min: 5, max: 120 },
  sailBreak: { min: 1, max: 30 },
  sailCycles: { min: 1, max: 8 },
  /** A sail call shows for this long after the skipper made it. */
  sailOfferMinutes: 5,
  prepSeconds: 60,
  cheerShowSeconds: 6,
  /** Your own credited minutes in the room needed for a beast's reward. */
  rewardMinDmg: 10,
  dailyRewards: { doubloons: 60, xp: 150 },
  bottle: { turnSeconds: 30, takeoverSeconds: 35, minTurnSeconds: 2, maxTurns: 60, buoys: 5, goal: { min: 3, max: 20 } },
  tidy: { pairsPerPatch: 6, timeLimitMs: 300_000, maxMs: 900_000, maxPatches: 6 },
} as const;

export const ROOM_COSTUMES = ["pwedo", "teddy", "bunny", "frog", "banana"] as const;
export type RoomCostume = (typeof ROOM_COSTUMES)[number];
/** Same ids as CrewAccessory in apps/web/src/ship-engine/kawaiiThemes.ts. */
export const ROOM_ACCESSORIES = ["none", "cafe-apron", "woodland-sprout", "sunflower", "pumpkin-cap", "star-pin", "astro-helmet", "jelly-bow"] as const;
export type RoomAccessory = (typeof ROOM_ACCESSORIES)[number];

// Append-only word lists (≤ 64 each). No staff words (Captain, Skipper, Admin, Mod, Official)
// and no character names (Banan, Pip, Mochi, Lumi, Pwedo).
export const NICK_ADJECTIVES: readonly string[] = ["Cozy", "Sleepy", "Sparkly", "Brave", "Gentle", "Cheery", "Comfy", "Curious", "Dreamy", "Breezy", "Sunny", "Starry", "Misty", "Mellow", "Bouncy", "Plucky", "Snug", "Toasty", "Zippy", "Jolly", "Calm", "Bright", "Busy", "Lucky", "Merry", "Nimble", "Quiet", "Steady", "Swift", "Tidy", "Clever", "Kind"];
export const NICK_NOUNS: readonly string[] = ["Dango", "Boba", "Muffin", "Pudding", "Teacup", "Acorn", "Clover", "Pebble", "Seashell", "Starfish", "Otter", "Panda", "Penguin", "Hedgehog", "Turtle", "Sparrow", "Dumpling", "Biscuit", "Marshmallow", "Lantern", "Compass", "Anchor", "Kite", "Cloud", "Comet", "Petal", "Maple", "Sprout", "Crayon", "Inkwell", "Bookmark", "Raindrop"];
/** Nickname numbers never used (the rules refuse them too). */
export const NICK_NUMBER_SKIP: readonly number[] = [14, 18, 69, 88];
export const ROOM_NAME_FIRST: readonly string[] = ["Mellow", "Cozy", "Quiet", "Sunny", "Starry", "Misty", "Breezy", "Snug", "Gentle", "Golden", "Silver", "Velvet", "Minty", "Peachy", "Lilac", "Honey", "Cocoa", "Maple", "Moonlit", "Dewy", "Rosy", "Toasty", "Calm", "Little", "Hidden", "Floating", "Sleepy", "Bright", "Cloudy", "Pebbly", "Mossy", "Sandy"];
export const ROOM_NAME_PLACE: readonly string[] = ["Lighthouse", "Teahouse", "Library", "Lagoon", "Greenhouse", "Treehouse", "Observatory", "Cabin", "Cove", "Garden", "Bakery", "Studio", "Harbor", "Meadow", "Orchard", "Island", "Reef", "Pier", "Attic", "Burrow", "Nook", "Den", "Cottage", "Workshop", "Reading Room", "Tide Pool", "Grotto", "Cloud Deck", "Sun Porch", "Galley", "Crow's Nest", "Map Room"];
export const ROOM_SUBJECTS: readonly string[] = ["Any subject", "Math", "Statistics", "Physics", "Chemistry", "Biology", "Medicine", "Earth & space", "Computer science", "Engineering", "History", "Government", "Economics", "English", "Psychology", "Philosophy", "Arts", "Geography", "Languages", "Music", "Homework", "Exam prep", "Reading", "Writing"];
/** Exactly 24: say 0..23. */
export const ROOM_CHEERS: readonly string[] = ["Let's go!", "You've got this!", "Nice work!", "Keep going!", "Almost there!", "Taking a break", "Back in 5", "Water break", "Snack break", "Stretch time", "Focusing now", "One more Pwedo Pomo?", "Thank you!", "Good luck!", "Proud of us!", "That was tricky", "Stuck, but trying", "Got it!", "Brain is full", "Ready when you are", "Good morning!", "Good night!", "See you soon!", "Ahoy!"];
/** The 12 die-cut stickers, in StickerArt's order: say 24..35. StickerArt.tsx builds STICKERS from these. */
export const STICKER_IDS = ["100-sign", "fire-focus", "boba-break", "teacup-nap", "plane-pwedo", "blanket-zz", "book-stack", "astro-mochi", "mini-dumbbell", "buttered-toast", "star-sparkle", "dango-trio"] as const;

export interface RoomLook {
  nick: [number, number, number];
  costume: number;
  accessory: number;
}

export interface RoomMember extends RoomLook {
  key: string;
  state: RoomState;
  /** Server ms when the current block ends, if a clock runs. */
  endsAt: number | null;
  joinedAt: number;
  seenAt: number;
  dmg: number;
  creditedAt: number;
  say: number;
  sayAt: number | null;
  tidy: { gid: number; patches: number; ms: number; mixups: number };
}

export interface RoomSail { at: number; focus: number; brk: number; cycles: number }
export interface RoomDeckRef { bottleId: string | null; cards: number }

export interface TidyGame { kind: "tidy"; v: 1; seed: number; at: number; seats: string[] }
export interface BottleGame {
  kind: "bottle"; v: 1; seed: number; at: number; seats: string[];
  /** How many cards the game deals (the deck's playable ones, stored as `n`): it ends when they run out. */
  cards: number;
  turn: number; holder: string; turnAt: number; card: number; delivered: number; buoys: number;
  rescue: boolean; goal: number; end: 0 | 1 | 2;
}
export type RoomGame = TidyGame | BottleGame;

export interface Room {
  code: string;
  mode: RoomMode;
  name: [number, number];
  subject: number;
  at: number;
  host: string;
  listed: boolean;
  locked: boolean;
  banned: string[];
  reportKeys: string[];
  why: Record<RoomReportReason, number>;
  banked: number;
  last: string | null;
  sail: RoomSail | null;
  deck: RoomDeckRef | null;
  game: RoomGame | null;
  /** In joinedAt order. */
  members: RoomMember[];
}

/** A room's public card (roomCards/{code}): all that anyone outside the room can see. */
export interface RoomCard {
  code: string;
  mode: RoomMode;
  name: [number, number];
  subject: number;
  at: number;
  listed: boolean;
  locked: boolean;
  aboard: number;
  aliveAt: number;
}
