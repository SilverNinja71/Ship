// Extra kawaii pastel costume minion badges for the Tiny Planner and UI headers.
// Study Rooms add a tiny accessory emblem (top right), a status dot (bottom right) and a
// "Skipper" ribbon; the characters themselves are unchanged.

import type { RoomAccessory } from "@ship/shared-types";
import { STATUS_DOT } from "./rooms/roomStyle.js";
import type { BadgeStatus } from "./rooms/roomStyle.js";

const AURA: Record<"banana" | "teddy" | "bunny" | "frog" | "pwedo", string> = {
  banana: "#FFF5C0",
  teddy: "#F7ECE1",
  bunny: "#F4EAFC",
  frog: "#E4F5EC",
  pwedo: "#E6F2FA",
};

export function PastelMinionBadge({
  costume = "banana",
  size = 44,
  accessory,
  status,
  skipper = false,
}: {
  costume?: "banana" | "teddy" | "bunny" | "frog" | "pwedo";
  size?: number;
  /** A tiny emblem at the top right (Study Rooms). */
  accessory?: RoomAccessory;
  /** A dot at the bottom right; away is the badge at half strength with "zZ". */
  status?: BadgeStatus;
  /** A small "Skipper" ribbon under the badge. */
  skipper?: boolean;
}) {
  const ink = "#A29C93";
  const pupil = "#8E887F";
  const blush = "#FBBAC4";
  const away = status === "away";
  const emblem = accessory && accessory !== "none";

  const svg = (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" opacity={away ? 0.5 : undefined}>
      {/* Soft pastel aura */}
      <circle cx="32" cy="34" r="25" fill={AURA[costume]} opacity="0.7" />
      {/* Tiny kawaii sparkles */}
      {away ? (
        <text x="4" y="17" fontSize="12" fontStyle="italic" fill={pupil} fontFamily="Georgia, serif">
          zZ
        </text>
      ) : (
        <path d="M10 15l1.2 2.4 2.4 1.2-2.4 1.2L10 22.2l-1.2-2.4-2.4-1.2 2.4-1.2L10 15Z" fill="#FCE38A" />
      )}
      {!emblem && <circle cx="53" cy="14" r="1.8" fill="#FBBAC4" />}
      {!status && <circle cx="55" cy="48" r="1.4" fill="#CBEAD7" />}

      {costume === "teddy" && (
        <>
          <circle cx="19" cy="18" r="7.5" fill="#F0DFCF" stroke={ink} strokeWidth="2.1" />
          <circle cx="19" cy="18" r="3.8" fill={blush} opacity="0.85" />
          <circle cx="45" cy="18" r="7.5" fill="#F0DFCF" stroke={ink} strokeWidth="2.1" />
          <circle cx="45" cy="18" r="3.8" fill={blush} opacity="0.85" />
          <rect x="14" y="16" width="36" height="40" rx="18" fill="#F0DFCF" stroke={ink} strokeWidth="2.1" />
          <rect x="19" y="21" width="26" height="22" rx="11" fill="#FFF7CA" stroke={ink} strokeWidth="1.8" />
        </>
      )}

      {costume === "bunny" && (
        <>
          <ellipse cx="23" cy="14" rx="5" ry="11.5" transform="rotate(-10 23 14)" fill="#EDE3FA" stroke={ink} strokeWidth="2.1" />
          <ellipse cx="23" cy="14" rx="2.4" ry="6.5" transform="rotate(-10 23 14)" fill={blush} opacity="0.85" />
          <ellipse cx="41" cy="14" rx="5" ry="11.5" transform="rotate(10 41 14)" fill="#EDE3FA" stroke={ink} strokeWidth="2.1" />
          <ellipse cx="41" cy="14" rx="2.4" ry="6.5" transform="rotate(10 41 14)" fill={blush} opacity="0.85" />
          <rect x="15" y="18" width="34" height="38" rx="17" fill="#EDE3FA" stroke={ink} strokeWidth="2.1" />
          <rect x="20" y="22" width="24" height="21" rx="10.5" fill="#FFF7CA" stroke={ink} strokeWidth="1.8" />
        </>
      )}

      {costume === "frog" && (
        <>
          <circle cx="22" cy="17" r="6.8" fill="#D4F0E0" stroke={ink} strokeWidth="2.1" />
          <circle cx="22" cy="16.8" r="2.2" fill={pupil} />
          <circle cx="21.3" cy="16.1" r="0.8" fill="#FFFFFF" />
          <circle cx="42" cy="17" r="6.8" fill="#D4F0E0" stroke={ink} strokeWidth="2.1" />
          <circle cx="42" cy="16.8" r="2.2" fill={pupil} />
          <circle cx="41.3" cy="16.1" r="0.8" fill="#FFFFFF" />
          <rect x="15" y="18" width="34" height="38" rx="17" fill="#D4F0E0" stroke={ink} strokeWidth="2.1" />
          <rect x="20" y="22" width="24" height="21" rx="10.5" fill="#FFF7CA" stroke={ink} strokeWidth="1.8" />
        </>
      )}

      {costume === "banana" && (
        <>
          {/* Pip: cute banana-stem one-eyed minion in baby-blue overalls */}
          <rect x="29.5" y="9" width="5" height="8" rx="2.5" fill="#E6D59B" stroke={ink} strokeWidth="2" />
          <rect x="16" y="15" width="32" height="41" rx="16" fill="#FFF6B8" stroke={ink} strokeWidth="2.1" />
          <path d="M16 38h32v5a14 14 0 0 1-14 14h-4a14 14 0 0 1-14-14v-5Z" fill="#DCEAF9" stroke="#B2C8E0" strokeWidth="2" />
          <path d="M16 38h32v5a14 14 0 0 1-14 14h-4a14 14 0 0 1-14-14v-5Z" fill="none" stroke={ink} strokeWidth="2.1" />
        </>
      )}

      {costume === "pwedo" ? (
        <>
          {/* Plump cute white pigeon body (Pwedo) */}
          <path
            d="M15 35c0-10.5 7.2-18 16.5-18 8.8 0 15.5 6.8 15.5 16.2 0 8.8-6.8 14.8-16.2 14.8-9.2 0-15.8-5.2-15.8-13Z"
            fill="#FFFFFF"
            stroke={ink}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          {/* Cute pastel beak */}
          <path d="M45 30l7 2.8-7 3.2Z" fill="#FFF3A8" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          {/* Soft curved wing */}
          <path d="M22 33c2 6 9.5 8 14.5 3.5" stroke={ink} strokeWidth="2.1" strokeLinecap="round" />
          {/* Sparkle eye & rosy cheek */}
          <circle cx="38" cy="28.5" r="2.3" fill={pupil} />
          <circle cx="37.2" cy="27.8" r="0.8" fill="#FFFFFF" />
          <ellipse cx="35.5" cy="33.5" rx="2.8" ry="1.8" fill={blush} />
          {/* Tiny feet */}
          <path d="M28 48v4M35 48v4" stroke={ink} strokeWidth="2" strokeLinecap="round" />
        </>
      ) : costume === "banana" ? (
        <>
          {/* Pip's signature single centered goggle eye + kawaii cheeks & smile */}
          <line x1="17.5" y1="27.5" x2="46.5" y2="27.5" stroke="#D5CEC3" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="32" cy="27.5" r="6.8" fill="#FFFFFF" stroke={ink} strokeWidth="2.2" />
          <circle cx="32.4" cy="27.5" r="3.0" fill={pupil} />
          <circle cx="31.2" cy="26.3" r="1.1" fill="#FFFFFF" />
          <ellipse cx="21.5" cy="34.2" rx="3.2" ry="2.0" fill={blush} />
          <ellipse cx="42.5" cy="34.2" rx="3.2" ry="2.0" fill={blush} />
          <path d="M29.5 34.8q2.5 2.4 5 0" stroke={pupil} strokeWidth="1.9" strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* Cute hand-drawn Mochi/Lumi dot eyes (no goggles!), rosy cheeks & gentle smile */}
          <circle cx="26.5" cy="29.5" r="2.4" fill={pupil} />
          <circle cx="37.5" cy="29.5" r="2.4" fill={pupil} />
          <circle cx="25.8" cy="28.7" r="0.8" fill="#FFFFFF" />
          <circle cx="36.8" cy="28.7" r="0.8" fill="#FFFFFF" />
          <ellipse cx="21.5" cy="35.2" rx="3.1" ry="1.9" fill={blush} />
          <ellipse cx="42.5" cy="35.2" rx="3.1" ry="1.9" fill={blush} />
          <path d="M29.5 35.8q2.5 2.4 5 0" stroke={pupil} strokeWidth="1.9" strokeLinecap="round" />
        </>
      )}
      {emblem && <AccessoryEmblem accessory={accessory} ink={ink} />}
      {status && status !== "away" && <circle cx="52" cy="52" r="5.5" fill={STATUS_DOT[status]} stroke="#FFFFFF" strokeWidth="2.2" />}
    </svg>
  );
  if (!skipper) return svg;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {svg}
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#E8C64A] bg-[#FFF1B8] px-1.5 font-serif text-[9px] leading-[13px] text-[#5B460F]">Skipper</span>
    </span>
  );
}

/** One small emblem per Study Rooms accessory, worn at the badge's top right. */
function AccessoryEmblem({ accessory, ink }: { accessory: RoomAccessory; ink: string }) {
  const line = { stroke: ink, strokeWidth: 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  switch (accessory) {
    case "cafe-apron":
      return (
        <g>
          <path d="M48.8 8.6a2.7 2.7 0 0 1 5.4 0" fill="none" {...line} />
          <path d="M47 9.6h9l1.6 9.4H45.4Z" fill="#F7E1CF" {...line} />
          <path d="M49.2 14.4h4.6" {...line} />
        </g>
      );
    case "woodland-sprout":
      return (
        <g>
          <path d="M51.5 19.5v-7" fill="none" {...line} />
          <path d="M51.5 13.2c-1-3.6-4-4.6-6.2-4.1.3 3.1 2.6 4.7 6.2 4.1Z" fill="#CBEAD7" {...line} />
          <path d="M51.5 12.2c1-3.6 4-4.6 6.2-4.1-.3 3.1-2.6 4.7-6.2 4.1Z" fill="#CBEAD7" {...line} />
        </g>
      );
    case "sunflower":
      return (
        <g>
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse key={a} cx="51.5" cy="7.8" rx="2.1" ry="3" transform={`rotate(${a} 51.5 12)`} fill="#FFE27A" {...line} strokeWidth={1.2} />
          ))}
          <circle cx="51.5" cy="12" r="2.6" fill="#C9A26B" {...line} strokeWidth={1.3} />
        </g>
      );
    case "pumpkin-cap":
      return (
        <g>
          <path d="M51.5 8.2V5.6" fill="none" {...line} />
          <ellipse cx="51.5" cy="12.8" rx="6.2" ry="4.8" fill="#F8C99B" {...line} />
          <path d="M51.5 8.2v9.2M48.2 8.9c-1.4 2.5-1.4 5.4 0 7.8M54.8 8.9c1.4 2.5 1.4 5.4 0 7.8" fill="none" {...line} strokeWidth={1.2} />
        </g>
      );
    case "star-pin":
      return <path d="M51.5 5.4l1.9 4 4.3.5-3.2 2.9.9 4.3-3.9-2.2-3.9 2.2.9-4.3-3.2-2.9 4.3-.5Z" fill="#FCE38A" {...line} strokeWidth={1.4} />;
    case "astro-helmet":
      return (
        <g>
          <circle cx="51.5" cy="12" r="6.2" fill="#F4F1FB" {...line} />
          <path d="M47.6 12.6a3.9 3.2 0 0 1 7.8 0v.6h-7.8Z" fill="#B2C8E0" {...line} strokeWidth={1.2} />
          <circle cx="55.6" cy="8.4" r="0.9" fill="#FFFFFF" />
        </g>
      );
    case "jelly-bow":
      return (
        <g>
          <path d="M51.5 12 45.6 8.3v7.4ZM51.5 12l5.9-3.7v7.4Z" fill="#FBD3DC" {...line} strokeWidth={1.4} />
          <circle cx="51.5" cy="12" r="1.9" fill="#FBBAC4" {...line} strokeWidth={1.3} />
        </g>
      );
    default:
      return null;
  }
}
