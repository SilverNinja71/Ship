// 12 original white-bordered die-cut SVG study stickers starring Ship's crew.
// Hand-crafted vector artwork (100% original, NO traced/third-party assets).

import { STICKER_IDS } from "@ship/shared-types";

export type StickerId = (typeof STICKER_IDS)[number];

export interface StickerDef {
  id: StickerId;
  label: string;
}

const STICKER_LABELS: Record<StickerId, string> = {
  "100-sign": "100% Goal",
  "fire-focus": "Locked In Fire",
  "boba-break": "Boba Break",
  "teacup-nap": "Warm Matcha Cup",
  "plane-pwedo": "Paper Plane Pwedo",
  "blanket-zz": "Cozy Blanket zZ",
  "book-stack": "Book Stack",
  "astro-mochi": "Astro Mochi",
  "mini-dumbbell": "Brain Lift",
  "buttered-toast": "Buttered Toast",
  "star-sparkle": "Star Sparkle",
  "dango-trio": "Dango Trio",
};

// Study Rooms send a sticker as its place in STICKER_IDS (say 24..35), so the order lives in
// shared-types and this list follows it.
export const STICKERS: readonly StickerDef[] = STICKER_IDS.map((id) => ({ id, label: STICKER_LABELS[id] }));

export function DieCutSticker({ id, size = 34 }: { id: string; size?: number }) {
  const ink = "#7C746B";
  const cream = "#FFFDF7";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-label={STICKERS.find((s) => s.id === id)?.label ?? id}
      className="sticker-pop shrink-0 drop-shadow-[0_1px_1px_rgb(0_0_0_/_0.12)]"
    >
      {/* White die-cut vinyl border halo */}
      <circle cx="24" cy="24" r="21" fill="#FFFFFF" stroke="#EAE4D8" strokeWidth="1.2" />

      {id === "100-sign" && (
        <>
          <rect x="11" y="12" width="26" height="17" rx="4" fill="#FFF3A8" stroke={ink} strokeWidth="2" />
          <text x="24" y="23.5" textAnchor="middle" fontSize="9.5" fontWeight="700" fill={ink} fontFamily="Georgia, serif">
            100%
          </text>
          <path d="M18 35c0-4 12-4 12 0" fill={cream} stroke={ink} strokeWidth="2" strokeLinecap="round" />
        </>
      )}

      {id === "fire-focus" && (
        <>
          <path d="M12 36c-2-10 4-19 12-26 8 7 14 16 12 26H12Z" fill="#F6A293" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="24" cy="28" r="8" fill="#FFF5B8" stroke={ink} strokeWidth="2" />
          <circle cx="21" cy="27" r="1.3" fill={ink} />
          <circle cx="27" cy="27" r="1.3" fill={ink} />
          <path d="M22.5 30q1.5 1.5 3 0" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}

      {id === "boba-break" && (
        <>
          <path d="M16 18h16l-2 19H18l-2-19Z" fill="#F4DFC0" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <ellipse cx="24" cy="18" rx="8.5" ry="2.6" fill="#D5E8C8" stroke={ink} strokeWidth="1.8" />
          <path d="M24 18l3-9" stroke="#8EA87D" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="21" cy="33" r="1.7" fill={ink} />
          <circle cx="25" cy="34" r="1.7" fill={ink} />
          <circle cx="27" cy="30" r="1.5" fill={ink} />
        </>
      )}

      {id === "teacup-nap" && (
        <>
          <path d="M13 21h18v7a9 9 0 0 1-18 0v-7Z" fill={cream} stroke={ink} strokeWidth="2" />
          <path d="M31 22c4 0 4 6 0 6" stroke={ink} strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="22" cy="21" rx="9" ry="2.8" fill="#CFE2BA" stroke={ink} strokeWidth="1.8" />
          <circle cx="22" cy="18.5" r="4.8" fill="#FFFFFF" stroke={ink} strokeWidth="1.8" />
          <circle cx="20.5" cy="18" r="0.9" fill={ink} />
          <circle cx="23.5" cy="18" r="0.9" fill={ink} />
        </>
      )}

      {id === "plane-pwedo" && (
        <>
          <path d="M10 21l24-8-10 17-4-6-10-3Z" fill="#DCEAF9" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="24" cy="14" r="5" fill="#FFFFFF" stroke={ink} strokeWidth="1.8" />
          <circle cx="26" cy="13" r="1" fill={ink} />
          <path d="M29 14l4 1.2-4 1.4Z" fill="#FFF3A8" stroke={ink} strokeWidth="1.4" />
        </>
      )}

      {id === "blanket-zz" && (
        <>
          <rect x="11" y="21" width="26" height="14" rx="7" fill="#FFF3A8" stroke={ink} strokeWidth="2" />
          <path d="M13 28h22" stroke="#F9C5C3" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="20" cy="18.5" r="5" fill={cream} stroke={ink} strokeWidth="1.8" />
          <text x="31" y="16" fontSize="8" fontStyle="italic" fontWeight="700" fill={ink} fontFamily="Georgia, serif">
            zZ
          </text>
        </>
      )}

      {id === "book-stack" && (
        <>
          <rect x="13" y="26" width="22" height="8" rx="2.5" fill="#DCEAF9" stroke={ink} strokeWidth="2" />
          <rect x="11" y="18" width="24" height="8" rx="2.5" fill="#CFE2BA" stroke={ink} strokeWidth="2" />
          <rect x="15" y="10" width="20" height="8" rx="2.5" fill="#FAD7D4" stroke={ink} strokeWidth="2" />
        </>
      )}

      {id === "astro-mochi" && (
        <>
          <circle cx="24" cy="24" r="13" fill="#DCEBFA" stroke="#9EB6D6" strokeWidth="2" />
          <circle cx="20" cy="20" r="3" fill="#EFE2D6" stroke={ink} strokeWidth="1.6" />
          <circle cx="28" cy="20" r="3" fill="#EFE2D6" stroke={ink} strokeWidth="1.6" />
          <ellipse cx="24" cy="25.5" rx="7.5" ry="6.5" fill="#EFE2D6" stroke={ink} strokeWidth="1.8" />
          <circle cx="22" cy="25" r="1.1" fill={ink} />
          <circle cx="26" cy="25" r="1.1" fill={ink} />
        </>
      )}

      {id === "mini-dumbbell" && (
        <>
          <path d="M15 24h18" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <rect x="10" y="18" width="6" height="12" rx="2.5" fill="#DCEAF9" stroke={ink} strokeWidth="2" />
          <rect x="32" y="18" width="6" height="12" rx="2.5" fill="#DCEAF9" stroke={ink} strokeWidth="2" />
        </>
      )}

      {id === "buttered-toast" && (
        <>
          <path d="M14 18a7 7 0 0 1 20 0v15a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V18Z" fill="#F7E4C4" stroke={ink} strokeWidth="2" />
          <rect x="20" y="21" width="8" height="7" rx="1.5" fill="#FFF3A8" stroke={ink} strokeWidth="1.6" />
          <circle cx="21" cy="31" r="1" fill={ink} />
          <circle cx="27" cy="31" r="1" fill={ink} />
        </>
      )}

      {id === "star-sparkle" && (
        <path
          d="M24 9l3.8 10.2L38 23l-10.2 3.8L24 37l-3.8-10.2L10 23l10.2-3.8L24 9Z"
          fill="#FFF3A8"
          stroke={ink}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}

      {id === "dango-trio" && (
        <>
          <path d="M24 10v28" stroke={ink} strokeWidth="2" strokeLinecap="round" />
          <circle cx="24" cy="14" r="5" fill="#FAD7D4" stroke={ink} strokeWidth="1.8" />
          <circle cx="24" cy="23" r="5" fill={cream} stroke={ink} strokeWidth="1.8" />
          <circle cx="24" cy="32" r="5" fill="#CFE2BA" stroke={ink} strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}
