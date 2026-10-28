// Sky and sea palettes for each environment, read by the ocean renderer and
// shown through the Captain's Quarters porthole.

import type { EnvironmentId } from "@ship/shared-types";

export interface EnvironmentTheme {
  id: EnvironmentId;
  name: string;
  skyTop: string;
  skyBottom: string;
  /** Back wave layer to front wave layer. */
  sea: [string, string, string];
  foam: string;
  cloud: string;
  /** What hangs in the sky. */
  celestial: "sun" | "moon" | "none";
  celestialColor: string;
  /** True for night scenes, so lanterns and glows switch on. */
  night: boolean;
  /** Clouds instead of water: the hull floats and waves are drawn as cloud banks. */
  cloudSea?: boolean;
}

export const ENVIRONMENTS: Record<EnvironmentId, EnvironmentTheme> = {
  "tropical-sea": {
    id: "tropical-sea",
    name: "Tropical Sea",
    skyTop: "#5EC8F2",
    skyBottom: "#CDEFFB",
    sea: ["#2FA6C9", "#1E8DB3", "#14739A"],
    foam: "#E9FBFF",
    cloud: "#FFFFFF",
    celestial: "sun",
    celestialColor: "#FFE38A",
    night: false,
  },
  "navy-grey-sea": {
    id: "navy-grey-sea",
    name: "Navy Grey Sea",
    skyTop: "#8FA3B5",
    skyBottom: "#D4DCE3",
    sea: ["#5D7487", "#4A6074", "#384D60"],
    foam: "#E3EAF0",
    cloud: "#EEF2F5",
    celestial: "sun",
    celestialColor: "#F3F0DE",
    night: false,
  },
  "twilight-clouds": {
    id: "twilight-clouds",
    name: "Twilight Cloud Sea",
    skyTop: "#2A2463",
    skyBottom: "#C98BC9",
    sea: ["#E6D6F5", "#D3BDEE", "#BBA2E2"],
    foam: "#FFFFFF",
    cloud: "#F4E9FF",
    celestial: "moon",
    celestialColor: "#FFF6D5",
    night: true,
    cloudSea: true,
  },
  "deep-reef": {
    id: "deep-reef",
    name: "Deep Reef",
    skyTop: "#1E7F9C",
    skyBottom: "#7FD8D2",
    sea: ["#178C95", "#0F6E7E", "#0A5266"],
    foam: "#C9FFF4",
    cloud: "#E9FFFB",
    celestial: "sun",
    celestialColor: "#FFF1B8",
    night: false,
  },
  "solar-sky": {
    id: "solar-sky",
    name: "Solar Sky",
    skyTop: "#F0703A",
    skyBottom: "#FFD58A",
    sea: ["#E59A4C", "#C9773A", "#A65A2C"],
    foam: "#FFF0C9",
    cloud: "#FFE3B8",
    celestial: "sun",
    celestialColor: "#FFF4B0",
    night: false,
  },
  "marigold-night": {
    id: "marigold-night",
    name: "Marigold Night",
    skyTop: "#160C33",
    skyBottom: "#5B2A6E",
    sea: ["#3B1E5C", "#2C154A", "#1E0E36"],
    foam: "#FFB84D",
    cloud: "#4A2A6A",
    celestial: "moon",
    celestialColor: "#FFE6B0",
    night: true,
  },
  "neon-mist": {
    id: "neon-mist",
    name: "Neon Mist",
    skyTop: "#0F1A24",
    skyBottom: "#2B4A4F",
    sea: ["#1E3B40", "#152C31", "#0D1E22"],
    foam: "#39FF88",
    cloud: "#3E6B63",
    celestial: "moon",
    celestialColor: "#CFFFE3",
    night: true,
  },
  "aegean-shallows": {
    id: "aegean-shallows",
    name: "Aegean Shallows",
    skyTop: "#4BA3E3",
    skyBottom: "#E6F4FF",
    sea: ["#3CC2D6", "#24A3C2", "#1584AA"],
    foam: "#FFFFFF",
    cloud: "#FFFFFF",
    celestial: "sun",
    celestialColor: "#FFF1A8",
    night: false,
  },
  "cedar-fjord": {
    id: "cedar-fjord",
    name: "Cedar Fjord",
    skyTop: "#6E8FA8",
    skyBottom: "#D6E2E8",
    sea: ["#3F6670", "#2F525C", "#223F48"],
    foam: "#E8F1F2",
    cloud: "#F1F5F7",
    celestial: "sun",
    celestialColor: "#FFF6DE",
    night: false,
  },
};
