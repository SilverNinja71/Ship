// Extra kawaii pastel costume minion badges for the Tiny Planner and UI headers.

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
}: {
  costume?: "banana" | "teddy" | "bunny" | "frog" | "pwedo";
  size?: number;
}) {
  const ink = "#A29C93";
  const pupil = "#8E887F";
  const blush = "#FBBAC4";

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* Soft pastel aura */}
      <circle cx="32" cy="34" r="25" fill={AURA[costume]} opacity="0.7" />
      {/* Tiny kawaii sparkles */}
      <path
        d="M10 15l1.2 2.4 2.4 1.2-2.4 1.2L10 22.2l-1.2-2.4-2.4-1.2 2.4-1.2L10 15Z"
        fill="#FCE38A"
      />
      <circle cx="53" cy="14" r="1.8" fill="#FBBAC4" />
      <circle cx="55" cy="48" r="1.4" fill="#CBEAD7" />

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
    </svg>
  );
}
