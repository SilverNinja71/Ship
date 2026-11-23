// 10 original hand-drawn kawaii stationery themes for Ship · Pwedo Pomo Studio.
// UI tokens use perceptually uniform OKLCH colors with WCAG AA >= 4.5:1 contrast.

export type KawaiiThemeId =
  | "matcha-cafe"
  | "mossy-woodland"
  | "sunny-sunflower"
  | "strawberry-shortcake"
  | "watermelon-picnic"
  | "autumn-mushroom"
  | "cozy-pumpkin"
  | "periwinkle-cosmos"
  | "midnight-moon"
  | "deep-sea-jellyfish";

export type CrewAccessory =
  | "none"
  | "cafe-apron"
  | "woodland-sprout"
  | "sunflower"
  | "pumpkin-cap"
  | "star-pin"
  | "astro-helmet"
  | "jelly-bow";

export type ThemePatternKind =
  | "gingham-stripes"
  | "wavy-hills"
  | "sunflowers"
  | "strawberries"
  | "watermelon"
  | "autumn-forest"
  | "pumpkin-patch"
  | "periwinkle-cosmos"
  | "midnight-moon"
  | "deep-sea";

export interface KawaiiTheme {
  id: KawaiiThemeId;
  name: string;
  tagline: string;
  price: number;
  isDark: boolean;
  patternKind: ThemePatternKind;
  accessory: CrewAccessory;
  affirmation: string;
  /** OKLCH CSS variables applied to documentElement */
  ui: {
    pageBg: string;
    surface1: string;
    surface2: string;
    surface3: string;
    ink: string;
    mutedInk: string;
    borderSubtle: string;
    gridLine: string;
    accent: string;
    accentInk: string;
  };
  /** Hex palette used inside HTML5 Canvas 2D renderers */
  canvas: {
    paperBg: string;
    paperAlt: string;
    skyTop: string;
    skyBottom: string;
    seaTop: string;
    seaBottom: string;
    inkStroke: string;
    pastel: string;
    accent: string;
    textInk: string;
  };
}

export const KAWAII_THEMES: Record<KawaiiThemeId, KawaiiTheme> = {
  "matcha-cafe": {
    id: "matcha-cafe",
    name: "Matcha Cafe",
    tagline: "Olive gingham, warm milk tea & Swiss roll slices",
    price: 0,
    isDark: false,
    patternKind: "gingham-stripes",
    accessory: "cafe-apron",
    affirmation: "Maw~ warm tea & steady pages",
    ui: {
      pageBg: "oklch(0.985 0.015 102)",
      surface1: "oklch(0.996 0.008 98)",
      surface2: "oklch(0.958 0.025 108)",
      surface3: "oklch(0.922 0.036 115)",
      ink: "oklch(0.385 0.038 118)",
      mutedInk: "oklch(0.475 0.032 118)",
      borderSubtle: "rgb(48 60 36 / 0.14)",
      gridLine: "rgb(98 118 76 / 0.10)",
      accent: "oklch(0.885 0.075 128)",
      accentInk: "oklch(0.32 0.045 128)",
    },
    canvas: {
      paperBg: "#FBF9EC",
      paperAlt: "#DCE6C8",
      skyTop: "#F8F6E6",
      skyBottom: "#EFF4DF",
      seaTop: "#DAE6C6",
      seaBottom: "#C6D7B0",
      inkStroke: "#7B7A6D",
      pastel: "#CFE2BA",
      accent: "#E7F0D3",
      textInk: "#525B44",
    },
  },
  "mossy-woodland": {
    id: "mossy-woodland",
    name: "Mossy Woodland",
    tagline: "Soft olive hills, cozy toadstools & butter paper",
    price: 0,
    isDark: false,
    patternKind: "wavy-hills",
    accessory: "woodland-sprout",
    affirmation: "doing my best",
    ui: {
      pageBg: "oklch(0.985 0.018 96)",
      surface1: "oklch(0.996 0.008 95)",
      surface2: "oklch(0.962 0.026 98)",
      surface3: "oklch(0.918 0.042 112)",
      ink: "oklch(0.375 0.035 108)",
      mutedInk: "oklch(0.47 0.03 108)",
      borderSubtle: "rgb(66 74 42 / 0.13)",
      gridLine: "rgb(112 124 72 / 0.10)",
      accent: "oklch(0.875 0.068 116)",
      accentInk: "oklch(0.33 0.045 112)",
    },
    canvas: {
      paperBg: "#FAF5DC",
      paperAlt: "#87965A",
      skyTop: "#FBF6E2",
      skyBottom: "#F4EED2",
      seaTop: "#DCE2C2",
      seaBottom: "#C7D0A5",
      inkStroke: "#7E7868",
      pastel: "#D7E0B8",
      accent: "#B8C48B",
      textInk: "#575B41",
    },
  },
  "sunny-sunflower": {
    id: "sunny-sunflower",
    name: "Sunny Sunflower",
    tagline: "Warm butter gold skies & tiny blooming sprouts",
    price: 150,
    isDark: false,
    patternKind: "sunflowers",
    accessory: "sunflower",
    affirmation: "little sprouts grow tall",
    ui: {
      pageBg: "oklch(0.985 0.028 94)",
      surface1: "oklch(0.996 0.01 94)",
      surface2: "oklch(0.965 0.042 92)",
      surface3: "oklch(0.935 0.068 90)",
      ink: "oklch(0.415 0.042 74)",
      mutedInk: "oklch(0.495 0.038 74)",
      borderSubtle: "rgb(102 78 30 / 0.14)",
      gridLine: "rgb(176 138 44 / 0.10)",
      accent: "oklch(0.905 0.125 90)",
      accentInk: "oklch(0.36 0.055 72)",
    },
    canvas: {
      paperBg: "#FFF6CF",
      paperAlt: "#FAD96D",
      skyTop: "#FFF4C2",
      skyBottom: "#FFE89E",
      seaTop: "#FCE8B2",
      seaBottom: "#F6D98E",
      inkStroke: "#8B7D65",
      pastel: "#FFE787",
      accent: "#FCE38A",
      textInk: "#665535",
    },
  },
  "strawberry-shortcake": {
    id: "strawberry-shortcake",
    name: "Strawberry Shortcake",
    tagline: "Blush pink cream, daisies & sweet berry breaks",
    price: 200,
    isDark: false,
    patternKind: "strawberries",
    accessory: "none",
    affirmation: "sweet focus, one berry at a time",
    ui: {
      pageBg: "oklch(0.982 0.018 18)",
      surface1: "oklch(0.996 0.008 18)",
      surface2: "oklch(0.962 0.028 18)",
      surface3: "oklch(0.932 0.042 18)",
      ink: "oklch(0.405 0.045 18)",
      mutedInk: "oklch(0.488 0.038 18)",
      borderSubtle: "rgb(112 52 58 / 0.13)",
      gridLine: "rgb(198 110 118 / 0.09)",
      accent: "oklch(0.895 0.068 18)",
      accentInk: "oklch(0.37 0.055 18)",
    },
    canvas: {
      paperBg: "#FDF0EE",
      paperAlt: "#F8C8C4",
      skyTop: "#FCE9E6",
      skyBottom: "#F9D6D2",
      seaTop: "#F6DFDB",
      seaBottom: "#ECC7C2",
      inkStroke: "#8C7877",
      pastel: "#F9C5C3",
      accent: "#FAD7D4",
      textInk: "#6B4A4A",
    },
  },
  "watermelon-picnic": {
    id: "watermelon-picnic",
    name: "Watermelon Picnic",
    tagline: "Coral melon skies with crisp sage picnic stripes",
    price: 200,
    isDark: false,
    patternKind: "watermelon",
    accessory: "none",
    affirmation: "crisp breaks keep minds bright",
    ui: {
      pageBg: "oklch(0.982 0.02 36)",
      surface1: "oklch(0.996 0.008 38)",
      surface2: "oklch(0.958 0.028 38)",
      surface3: "oklch(0.925 0.042 128)",
      ink: "oklch(0.395 0.042 36)",
      mutedInk: "oklch(0.485 0.036 36)",
      borderSubtle: "rgb(104 58 46 / 0.13)",
      gridLine: "rgb(184 102 82 / 0.09)",
      accent: "oklch(0.885 0.068 32)",
      accentInk: "oklch(0.36 0.055 32)",
    },
    canvas: {
      paperBg: "#FBE8DF",
      paperAlt: "#DF9A86",
      skyTop: "#F7DCD0",
      skyBottom: "#F4CBBF",
      seaTop: "#C6D3A5",
      seaBottom: "#B1C18B",
      inkStroke: "#85746C",
      pastel: "#EE9E8C",
      accent: "#C6D3A5",
      textInk: "#63463D",
    },
  },
  "autumn-mushroom": {
    id: "autumn-mushroom",
    name: "Autumn Mushroom",
    tagline: "Warm terracotta woods, oak leaves & cream clouds",
    price: 250,
    isDark: false,
    patternKind: "autumn-forest",
    accessory: "woodland-sprout",
    affirmation: "cozy autumn study drift",
    ui: {
      pageBg: "oklch(0.978 0.022 68)",
      surface1: "oklch(0.994 0.01 72)",
      surface2: "oklch(0.948 0.032 68)",
      surface3: "oklch(0.908 0.046 58)",
      ink: "oklch(0.385 0.048 45)",
      mutedInk: "oklch(0.48 0.042 45)",
      borderSubtle: "rgb(96 52 38 / 0.14)",
      gridLine: "rgb(154 88 64 / 0.09)",
      accent: "oklch(0.865 0.072 48)",
      accentInk: "oklch(0.35 0.065 36)",
    },
    canvas: {
      paperBg: "#F2DFC6",
      paperAlt: "#9A4A3D",
      skyTop: "#F3E4CF",
      skyBottom: "#EAD2B3",
      seaTop: "#D9BFA0",
      seaBottom: "#C6A484",
      inkStroke: "#7C6458",
      pastel: "#D78374",
      accent: "#B4BE90",
      textInk: "#5C3D32",
    },
  },
  "cozy-pumpkin": {
    id: "cozy-pumpkin",
    name: "Cozy Pumpkin",
    tagline: "Harvest amber hills, mini ghosts & autumn sparkles",
    price: 250,
    isDark: false,
    patternKind: "pumpkin-patch",
    accessory: "pumpkin-cap",
    affirmation: "glowing steady through the evening",
    ui: {
      pageBg: "oklch(0.98 0.026 70)",
      surface1: "oklch(0.996 0.01 72)",
      surface2: "oklch(0.955 0.045 68)",
      surface3: "oklch(0.915 0.072 64)",
      ink: "oklch(0.395 0.062 52)",
      mutedInk: "oklch(0.485 0.052 52)",
      borderSubtle: "rgb(112 62 20 / 0.15)",
      gridLine: "rgb(198 112 36 / 0.09)",
      accent: "oklch(0.875 0.115 68)",
      accentInk: "oklch(0.35 0.075 48)",
    },
    canvas: {
      paperBg: "#FFF0DA",
      paperAlt: "#E58B2E",
      skyTop: "#FCE6C8",
      skyBottom: "#F8D19E",
      seaTop: "#EFBA7A",
      seaBottom: "#E39F52",
      inkStroke: "#806652",
      pastel: "#F3B06B",
      accent: "#F8D8A8",
      textInk: "#66401E",
    },
  },
  "periwinkle-cosmos": {
    id: "periwinkle-cosmos",
    name: "Periwinkle Cosmos",
    tagline: "Lavender orbit skies, ringed planets & star music",
    price: 300,
    isDark: false,
    patternKind: "periwinkle-cosmos",
    accessory: "star-pin",
    affirmation: "floating gently on study orbit",
    ui: {
      pageBg: "oklch(0.968 0.028 278)",
      surface1: "oklch(0.992 0.012 278)",
      surface2: "oklch(0.938 0.042 278)",
      surface3: "oklch(0.895 0.065 278)",
      ink: "oklch(0.355 0.078 276)",
      mutedInk: "oklch(0.465 0.068 276)",
      borderSubtle: "rgb(54 58 122 / 0.15)",
      gridLine: "rgb(104 108 188 / 0.11)",
      accent: "oklch(0.875 0.088 278)",
      accentInk: "oklch(0.32 0.082 276)",
    },
    canvas: {
      paperBg: "#EAECFC",
      paperAlt: "#8E92D6",
      skyTop: "#D2D6FA",
      skyBottom: "#B3B7F2",
      seaTop: "#8E93D6",
      seaBottom: "#747AC4",
      inkStroke: "#6D708E",
      pastel: "#C5C8FA",
      accent: "#FFE48E",
      textInk: "#3E437A",
    },
  },
  "midnight-moon": {
    id: "midnight-moon",
    name: "Midnight Moon",
    tagline: "Late-night study orbit with crescent UFO & ghosts",
    price: 350,
    isDark: true,
    patternKind: "midnight-moon",
    accessory: "astro-helmet",
    affirmation: "I will succeed because I'm crazy",
    ui: {
      pageBg: "oklch(0.245 0.055 270)",
      surface1: "oklch(0.285 0.058 270)",
      surface2: "oklch(0.325 0.062 270)",
      surface3: "oklch(0.365 0.065 270)",
      ink: "oklch(0.955 0.015 95)",
      mutedInk: "oklch(0.835 0.025 270)",
      borderSubtle: "rgb(255 255 255 / 0.14)",
      gridLine: "rgb(200 206 255 / 0.08)",
      accent: "oklch(0.865 0.115 92)",
      accentInk: "oklch(0.24 0.055 270)",
    },
    canvas: {
      paperBg: "#283363",
      paperAlt: "#454D85",
      skyTop: "#252E5C",
      skyBottom: "#353E78",
      seaTop: "#6F73A8",
      seaBottom: "#575B8E",
      inkStroke: "#DDD9EE",
      pastel: "#FCE07C",
      accent: "#B4B9EB",
      textInk: "#F6F3FA",
    },
  },
  "deep-sea-jellyfish": {
    id: "deep-sea-jellyfish",
    name: "Deep Sea Jellyfish",
    tagline: "Cobalt deep ocean drift with glowing baby jellyfish",
    price: 350,
    isDark: true,
    patternKind: "deep-sea",
    accessory: "jelly-bow",
    affirmation: "calm current, deep focus",
    ui: {
      pageBg: "oklch(0.275 0.075 258)",
      surface1: "oklch(0.318 0.078 258)",
      surface2: "oklch(0.358 0.082 258)",
      surface3: "oklch(0.402 0.085 258)",
      ink: "oklch(0.962 0.014 235)",
      mutedInk: "oklch(0.845 0.032 238)",
      borderSubtle: "rgb(255 255 255 / 0.15)",
      gridLine: "rgb(168 214 255 / 0.08)",
      accent: "oklch(0.845 0.075 225)",
      accentInk: "oklch(0.24 0.075 258)",
    },
    canvas: {
      paperBg: "#2F4E94",
      paperAlt: "#3F62AE",
      skyTop: "#2B4A8E",
      skyBottom: "#3B5CA8",
      seaTop: "#496DC0",
      seaBottom: "#314F96",
      inkStroke: "#D9EAFA",
      pastel: "#A4D2F4",
      accent: "#FFE48E",
      textInk: "#F2F7FD",
    },
  },
};

export const KAWAII_THEME_LIST: KawaiiTheme[] = Object.values(KAWAII_THEMES);

export function getKawaiiTheme(id: string | null | undefined): KawaiiTheme {
  if (id && id in KAWAII_THEMES) return KAWAII_THEMES[id as KawaiiThemeId];
  return KAWAII_THEMES["matcha-cafe"];
}

/** Synchronizes document root CSS custom properties with the active kawaii theme. */
export function applyThemeVariables(theme: KawaiiTheme, active: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!active) {
    root.dataset.themeDark = "false";
    for (const prop of [
      "--page-bg",
      "--surface-1",
      "--surface-2",
      "--surface-3",
      "--page-ink",
      "--muted-ink",
      "--border-subtle",
      "--grid-line",
      "--theme-accent",
      "--theme-accent-ink",
    ]) {
      root.style.removeProperty(prop);
    }
    return;
  }
  root.dataset.themeDark = theme.isDark ? "true" : "false";
  root.style.setProperty("--page-bg", theme.ui.pageBg);
  root.style.setProperty("--surface-1", theme.ui.surface1);
  root.style.setProperty("--surface-2", theme.ui.surface2);
  root.style.setProperty("--surface-3", theme.ui.surface3);
  root.style.setProperty("--page-ink", theme.ui.ink);
  root.style.setProperty("--muted-ink", theme.ui.mutedInk);
  root.style.setProperty("--border-subtle", theme.ui.borderSubtle);
  root.style.setProperty("--grid-line", theme.ui.gridLine);
  root.style.setProperty("--theme-accent", theme.ui.accent);
  root.style.setProperty("--theme-accent-ink", theme.ui.accentInk);
}
