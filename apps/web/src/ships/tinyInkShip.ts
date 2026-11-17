// Kawaii pastel theme overrides for ships in Tiny Ink / Mr. Tiny Studio mode.
// Keeps Woolly Wanderer as the warm cream starter ship and gives upgrade ships
// (Golden Mane, Floating Galley, Sunfish, Crimson Corsair, etc.) soft pastel palettes.

import type { ShipDefinition, ShipPalette } from "@ship/shared-types";
import type { EnvironmentTheme } from "@ship/ship-theme-kit";
import { mix } from "../ship-engine/draw.js";

export interface KawaiiShipTheme {
  palette: ShipPalette;
  cardBg: string;
  badgeBg: string;
  badgeText: string;
  pastelLabel: string;
}

export const KAWAII_SHIP_THEMES: Record<string, KawaiiShipTheme> = {
  "woolly-wanderer": {
    palette: {
      hull: "#FAF4E4",
      hullDark: "#E6DBC4",
      trim: "#C4A882",
      deck: "#CFE8C4",
      sail: "#FFFDF7",
      sailShade: "#EFE7D6",
      accent: "#FFE49E",
      glow: "#FFF1B8",
    },
    cardBg: "#FFFDF7",
    badgeBg: "#FFF3A8",
    badgeText: "#6D655C",
    pastelLabel: "Cream & Mint Starter",
  },
  "golden-mane": {
    palette: {
      hull: "#FCE49C",
      hullDark: "#ECC66E",
      trim: "#D2A77D",
      deck: "#CBE7B8",
      sail: "#FFFDF7",
      sailShade: "#F4EBD3",
      accent: "#FAB8A5",
      glow: "#FFF0B3",
    },
    cardBg: "#FFFBF0",
    badgeBg: "#FFE8A8",
    badgeText: "#7C6234",
    pastelLabel: "Honey Buttercream",
  },
  "floating-galley": {
    palette: {
      hull: "#BCE2F2",
      hullDark: "#98CBE0",
      trim: "#FCE7A2",
      deck: "#E8D2BC",
      sail: "#FFFDF7",
      sailShade: "#EAE5DA",
      accent: "#F7B2B0",
      glow: "#FFE4B5",
    },
    cardBg: "#F7FCFF",
    badgeBg: "#D7EFFA",
    badgeText: "#4A6F82",
    pastelLabel: "Sky Milk & Peach",
  },
  sunfish: {
    palette: {
      hull: "#FCEB9D",
      hullDark: "#E8D072",
      trim: "#A8A2B8",
      deck: "#F5DF89",
      sail: "#FCEB9D",
      sailShade: "#E8D072",
      accent: "#F7B5AA",
      glow: "#C9F0FA",
    },
    cardBg: "#FFFCF0",
    badgeBg: "#D8F3FA",
    badgeText: "#4B6F78",
    pastelLabel: "Lemon Chiffon Sub",
  },
  "crimson-corsair": {
    palette: {
      hull: "#F4B6BE",
      hullDark: "#DC96A0",
      trim: "#E6D5C3",
      deck: "#EBD5C1",
      sail: "#FFFDF7",
      sailShade: "#F2E6E6",
      accent: "#FCE3A1",
      glow: "#FFD6DC",
    },
    cardBg: "#FFF8F9",
    badgeBg: "#FAD6DC",
    badgeText: "#8A4A53",
    pastelLabel: "Strawberry Milk",
  },
};

/** Returns a kawaii pastel ShipDefinition for Shipwright & Tiny Ink previews. */
export function toKawaiiPastelShip(ship: ShipDefinition): ShipDefinition {
  const override = KAWAII_SHIP_THEMES[ship.id];
  if (override) {
    return { ...ship, palette: override.palette };
  }
  const p = ship.palette;
  return {
    ...ship,
    palette: {
      hull: mix(p.hull, "#FFFDF5", 0.45),
      hullDark: mix(p.hullDark, "#FAF4E4", 0.45),
      trim: mix(p.trim, "#E8DFD1", 0.45),
      deck: mix(p.deck, "#FAF6E8", 0.4),
      sail: "#FFFDF7",
      sailShade: mix(p.sailShade, "#F2ECE0", 0.5),
      accent: mix(p.accent, "#FFF3D6", 0.42),
      glow: mix(p.glow ?? "#FFF3A8", "#FFFDF5", 0.4),
    },
  };
}

/** Softly pastelizes an environment theme so Shipwright previews stay warm & airy. */
export function toKawaiiPastelEnv(env: EnvironmentTheme): EnvironmentTheme {
  if (env.night) {
    return {
      ...env,
      skyTop: mix(env.skyTop, "#D8D2E8", 0.52),
      skyBottom: mix(env.skyBottom, "#F2EBF5", 0.55),
      sea: [
        mix(env.sea[0], "#CFC9DE", 0.5),
        mix(env.sea[1], "#BFB8D2", 0.5),
        mix(env.sea[2], "#AFA8C4", 0.5),
      ],
      foam: "#FFFDF7",
      cloud: "#FFFDF7",
      celestialColor: "#FFF5CC",
    };
  }
  return {
    ...env,
    skyTop: mix(env.skyTop, "#FAF6E8", 0.55),
    skyBottom: mix(env.skyBottom, "#FFFDF7", 0.6),
    sea: [
      mix(env.sea[0], "#EBF5F7", 0.5),
      mix(env.sea[1], "#DDF0F4", 0.5),
      mix(env.sea[2], "#CFE8EE", 0.5),
    ],
    foam: "#FFFDF7",
    cloud: "#FFFFFF",
    celestialColor: "#FFF3B8",
  };
}

export function getKawaiiTheme(shipId: string): KawaiiShipTheme | undefined {
  return KAWAII_SHIP_THEMES[shipId];
}
