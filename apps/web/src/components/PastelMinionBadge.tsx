// Cute pastel costume minion badges for the Tiny Planner and UI headers.

export function PastelMinionBadge({
  costume = "banana",
  size = 44,
}: {
  costume?: "banana" | "teddy" | "bunny" | "frog";
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {costume === "teddy" && (
        <>
          <circle cx="19" cy="18" r="8" fill="#E8D3C2" stroke="#24212A" strokeWidth="2.5" />
          <circle cx="19" cy="18" r="4" fill="#F8B8C0" />
          <circle cx="45" cy="18" r="8" fill="#E8D3C2" stroke="#24212A" strokeWidth="2.5" />
          <circle cx="45" cy="18" r="4" fill="#F8B8C0" />
          <rect x="14" y="15" width="36" height="42" rx="18" fill="#E8D3C2" stroke="#24212A" strokeWidth="2.5" />
          <rect x="19" y="21" width="26" height="22" rx="11" fill="#FFF3A8" stroke="#24212A" strokeWidth="2" />
        </>
      )}
      {costume === "bunny" && (
        <>
          <ellipse cx="23" cy="14" rx="5" ry="12" transform="rotate(-10 23 14)" fill="#E6DAF8" stroke="#24212A" strokeWidth="2.5" />
          <ellipse cx="23" cy="14" rx="2.5" ry="7" transform="rotate(-10 23 14)" fill="#F8B8C0" />
          <ellipse cx="41" cy="14" rx="5" ry="12" transform="rotate(10 41 14)" fill="#E6DAF8" stroke="#24212A" strokeWidth="2.5" />
          <ellipse cx="41" cy="14" rx="2.5" ry="7" transform="rotate(10 41 14)" fill="#F8B8C0" />
          <rect x="15" y="17" width="34" height="40" rx="17" fill="#E6DAF8" stroke="#24212A" strokeWidth="2.5" />
          <rect x="20" y="22" width="24" height="21" rx="10" fill="#FFF3A8" stroke="#24212A" strokeWidth="2" />
        </>
      )}
      {costume === "frog" && (
        <>
          <circle cx="22" cy="17" r="7" fill="#CBEAD7" stroke="#24212A" strokeWidth="2.5" />
          <circle cx="22" cy="17" r="2.2" fill="#24212A" />
          <circle cx="42" cy="17" r="7" fill="#CBEAD7" stroke="#24212A" strokeWidth="2.5" />
          <circle cx="42" cy="17" r="2.2" fill="#24212A" />
          <rect x="15" y="17" width="34" height="40" rx="17" fill="#CBEAD7" stroke="#24212A" strokeWidth="2.5" />
          <rect x="20" y="22" width="24" height="21" rx="10" fill="#FFF3A8" stroke="#24212A" strokeWidth="2" />
        </>
      )}
      {costume === "banana" && (
        <>
          <rect x="29" y="9" width="6" height="8" rx="2" fill="#D9C382" stroke="#24212A" strokeWidth="2.2" />
          <rect x="16" y="15" width="32" height="42" rx="16" fill="#FFF3A8" stroke="#24212A" strokeWidth="2.5" />
          <path d="M16 38h32v6a14 14 0 0 1-14 14h-4a14 14 0 0 1-14-14v-6Z" fill="#CFE2F7" stroke="#24212A" strokeWidth="2.5" />
          <path d="M27 36c-11-3-16 4-15 15 6 3 12 2 15-3V36Z" fill="#FFF7C2" stroke="#24212A" strokeWidth="2.3" />
          <path d="M37 36c11-3 16 4 15 15-6 3-12 2-15-3V36Z" fill="#FFF7C2" stroke="#24212A" strokeWidth="2.3" />
        </>
      )}
      {/* Goggle strap & cute goggle eyes */}
      <line x1="17" y1="30" x2="47" y2="30" stroke="#4A4654" strokeWidth="4" />
      <circle cx="26.5" cy="30" r="5.5" fill="#FFFFFF" stroke="#24212A" strokeWidth="2.2" />
      <circle cx="37.5" cy="30" r="5.5" fill="#FFFFFF" stroke="#24212A" strokeWidth="2.2" />
      <circle cx="27" cy="30" r="2.3" fill="#24212A" />
      <circle cx="38" cy="30" r="2.3" fill="#24212A" />
      {/* Rosy cheeks & tiny smile */}
      <ellipse cx="22" cy="37" rx="2.8" ry="1.8" fill="#F8B8C0" />
      <ellipse cx="42" cy="37" rx="2.8" ry="1.8" fill="#F8B8C0" />
      <path d="M28.5 37.5a3.5 3.5 0 0 0 7 0" stroke="#24212A" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
