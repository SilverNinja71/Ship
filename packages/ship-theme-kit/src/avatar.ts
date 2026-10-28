// The sailor's wardrobe. Skin tones, hair styles and colors are always free:
// who you are is never behind a paywall. Hats, coats, accessories and tools
// are the things you earn.

import type {
  AccessoryId,
  AvatarItemKind,
  AvatarLoadout,
  CoatId,
  HairStyle,
  HatId,
  SkinTone,
  StudyToolId,
} from "@ship/shared-types";
import type { CatalogItem } from "./parts.js";

export interface SkinToneSwatch {
  id: SkinTone;
  name: string;
  base: string;
  /** Cheek blush and the shadow under the hair. */
  shade: string;
}

export const SKIN_TONES: readonly SkinToneSwatch[] = [
  { id: "porcelain", name: "Porcelain", base: "#F6E1D3", shade: "#E7C2AE" },
  { id: "peach", name: "Peach", base: "#F1C7A5", shade: "#DFA684" },
  { id: "sand", name: "Sand", base: "#E3B48B", shade: "#CB956B" },
  { id: "honey", name: "Honey", base: "#CF9A66", shade: "#B47D4C" },
  { id: "bronze", name: "Bronze", base: "#A86F45", shade: "#8C5733" },
  { id: "umber", name: "Umber", base: "#7D4F31", shade: "#643C23" },
  { id: "ebony", name: "Ebony", base: "#4E3122", shade: "#3A2318" },
];

export const HAIR_COLORS: readonly string[] = [
  "#2B1D14",
  "#5A3A22",
  "#8B5A2B",
  "#C68642",
  "#E6C27A",
  "#D9534F",
  "#3B5BA9",
  "#7BC8A4",
  "#F2A7C3",
  "#EDEDED",
];

export const COAT_COLORS: readonly string[] = [
  "#C2524A",
  "#2E5E8B",
  "#3F7A4A",
  "#D9822B",
  "#6B4C9A",
  "#2B2B2B",
  "#F2E6C9",
  "#1F8A8A",
];

const starter = { price: 0, levelRequired: 1, source: "starter" } as const;
const shop = (price: number, levelRequired: number) => ({ price, levelRequired, source: "shop" }) as const;

export const HAIR_STYLES: readonly CatalogItem<HairStyle>[] = [
  { id: "messy", name: "Messy", description: "Woke up like this.", ...starter },
  { id: "bob", name: "Bob", description: "Short and tidy.", ...starter },
  { id: "long", name: "Long", description: "Flows in the sea breeze.", ...starter },
  { id: "ponytail", name: "Ponytail", description: "Out of the way for serious study.", ...starter },
  { id: "buzz", name: "Buzz Cut", description: "Low maintenance.", ...starter },
  { id: "braids", name: "Braids", description: "Two neat braids.", ...starter },
  { id: "curls", name: "Curls", description: "Big and bouncy.", ...starter },
  { id: "spiky", name: "Spiky", description: "Sticks straight up.", ...starter },
  { id: "bun", name: "Bun", description: "Pencil optional.", ...starter },
];

export const HATS: readonly CatalogItem<HatId>[] = [
  { id: "none", name: "No Hat", description: "Let the wind in your hair.", ...starter },
  { id: "straw-hat", name: "Straw Hat", description: "A wide-brimmed sun hat with a red band.", ...starter },
  { id: "bandana", name: "Bandana", description: "Knotted at the back.", ...starter },
  { id: "beanie", name: "Beanie", description: "Warm for cold fjords.", ...shop(120, 1) },
  { id: "tricorn", name: "Tricorn", description: "Three corners of authority.", ...shop(200, 2) },
  { id: "captain-cap", name: "Captain's Cap", description: "White top, gold anchor.", ...shop(300, 3) },
  { id: "marine-cap", name: "Marine Cap", description: "Regulation navy issue.", ...shop(300, 4) },
  { id: "flower-crown", name: "Flower Crown", description: "Marigolds and citrus blossoms.", ...shop(350, 5) },
  { id: "laurel-wreath", name: "Laurel Wreath", description: "For champions of the exam hall.", ...shop(400, 7) },
  { id: "aviator-cap", name: "Aviator Cap", description: "Leather flaps for high-altitude sailing.", ...shop(500, 8) },
];

export const COATS: readonly CatalogItem<CoatId>[] = [
  { id: "striped-shirt", name: "Striped Shirt", description: "The classic sailor stripes.", ...starter },
  { id: "hoodie", name: "Hoodie", description: "Late-night study uniform.", ...starter },
  { id: "vest", name: "Vest", description: "Smart, with brass buttons.", ...shop(150, 1) },
  { id: "flannel", name: "Flannel", description: "Smells like woodsmoke.", ...shop(200, 2) },
  { id: "pirate-coat", name: "Pirate Coat", description: "Long tails and gold cuffs.", ...shop(400, 3) },
  { id: "marine-uniform", name: "Marine Uniform", description: "Pressed and starched.", ...shop(450, 4) },
  { id: "toga", name: "Toga", description: "For philosophers at sea.", ...shop(450, 7) },
  { id: "flight-jacket", name: "Flight Jacket", description: "Shearling collar for cloud-galleons.", ...shop(600, 8) },
];

export const ACCESSORIES: readonly CatalogItem<AccessoryId>[] = [
  { id: "none", name: "Nothing", description: "Keep it simple.", ...starter },
  { id: "glasses", name: "Glasses", description: "Round and studious.", ...starter },
  { id: "scarf", name: "Scarf", description: "Flutters in the wind.", ...shop(120, 1) },
  { id: "earring", name: "Gold Earring", description: "A single gold hoop.", ...shop(150, 2) },
  { id: "eyepatch", name: "Eyepatch", description: "Purely decorative. Probably.", ...shop(200, 3) },
  { id: "parrot", name: "Parrot", description: "Repeats your flashcards back to you.", ...shop(800, 6) },
  { id: "aviator-goggles", name: "Aviator Goggles", description: "Pairs nicely with a cloud-galleon.", ...shop(500, 8) },
];

export const STUDY_TOOLS: readonly CatalogItem<StudyToolId>[] = [
  { id: "quill-logbook", name: "Quill & Logbook", description: "Ink, paper and patience.", ...starter },
  { id: "laptop", name: "Laptop", description: "A trusty laptop with stickers.", ...starter },
  { id: "tablet", name: "Tablet", description: "With a stylus for handwritten notes.", ...shop(300, 2) },
  { id: "mech-keyboard", name: "Mechanical Keyboard", description: "Clicky. Very clicky.", ...shop(400, 4) },
];

export const AVATAR_CATALOGS = {
  hair: HAIR_STYLES,
  hat: HATS,
  coat: COATS,
  accessory: ACCESSORIES,
  tool: STUDY_TOOLS,
} as const satisfies Record<AvatarItemKind, readonly CatalogItem[]>;

export const DEFAULT_AVATAR: AvatarLoadout = {
  name: "Captain",
  skin: "peach",
  hair: "messy",
  hairColor: HAIR_COLORS[0],
  hat: "straw-hat",
  coat: "striped-shirt",
  coatColor: COAT_COLORS[0],
  accessory: "none",
  tool: "quill-logbook",
};

export function getAvatarItem(kind: AvatarItemKind, id: string): CatalogItem | undefined {
  return (AVATAR_CATALOGS[kind] as readonly CatalogItem[]).find((p) => p.id === id);
}

export function getSkinTone(id: SkinTone): SkinToneSwatch {
  return SKIN_TONES.find((s) => s.id === id) ?? SKIN_TONES[1];
}

/** The key an avatar item is stored under in `Inventory.avatarItems`. */
export function avatarItemKey(kind: AvatarItemKind, id: string): string {
  return `${kind}:${id}`;
}
