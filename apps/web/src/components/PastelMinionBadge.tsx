// Extra kawaii pastel costume minion badges for the Tiny Planner and UI headers.

const AURA: Record<"banana" | "teddy" | "bunny" | "frog", string> = {
  banana: "#FFF5C0",
  teddy: "#F7ECE1",
  bunny: "#F4EAFC",
  frog: "#E4F5EC",
};

export function PastelMinionBadge({
  costume = "banana",
  size = 44,
}: {
  costume?: "banana" | "teddy" | "bunny" | "frog";
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
          <rect x="29" y="9" width="6" height="8" rx="2.5" fill="#E6D59B" stroke={ink} strokeWidth="2" />
          <rect x="16" y="15" width="32" height="41" rx="16" fill="#FFF6B8" stroke={ink} strokeWidth="2.1" />
          <path d="M16 38h32v5a14 14 0 0 1-14 14h-4a14 14 0 0 1-14-14v-5Z" fill="#D8E9FA" stroke={ink} strokeWidth="2.1" />
          <path d="M27 36c-10.5-3-15.5 4-14.5 14.5 5.8 2.8 11.5 1.8 14.5-3V36Z" fill="#FFF9D2" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <path d="M37 36c10.5-3 15.5 4 14.5 14.5-5.8 2.8-11.5 1.8-14.5-3V36Z" fill="#FFF9D2" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        </>
      )}

      {/* Soft pastel goggle strap & big kawaii sparkle eyes */}
      <line x1="17.5" y1="30" x2="46.5" y2="30" stroke="#D5CEC3" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="26.5" cy="30" r="5.4" fill="#FFFFFF" stroke={ink} strokeWidth="2" />
      <circle cx="37.5" cy="30" r="5.4" fill="#FFFFFF" stroke={ink} strokeWidth="2" />
      <circle cx="26.8" cy="30" r="2.4" fill={pupil} />
      <circle cx="37.8" cy="30" r="2.4" fill={pupil} />
      {/* Tiny white eye-shine dots */}
      <circle cx="25.9" cy="29.1" r="0.9" fill="#FFFFFF" />
      <circle cx="36.9" cy="29.1" r="0.9" fill="#FFFFFF" />

      {/* Rosy pastel cheeks & sweet tiny kawaii smile */}
      <ellipse cx="21.8" cy="36.8" rx="2.9" ry="1.8" fill={blush} />
      <ellipse cx="42.2" cy="36.8" rx="2.9" ry="1.8" fill={blush} />
      <path d="M29 37.2c.8 1.3 2.2 1.3 3 0 .8 1.3 2.2 1.3 3 0" stroke={pupil} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
