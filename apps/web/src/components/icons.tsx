// Small line icons drawn for Ship (24×24, stroke = currentColor).

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconHelm = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="1.5" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
  </Icon>
);
export const IconLog = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" />
  </Icon>
);
export const IconCards = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="6" width="13" height="15" rx="2" />
    <path d="M8 3h11a2 2 0 0 1 2 2v12" />
  </Icon>
);
export const IconHammer = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 21l9.5-9.5" />
    <path d="M12.5 3.5l8 8-3 3-8-8z" />
    <path d="M14 5l1.5-1.5" />
  </Icon>
);
export const IconShirt = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3l4 3 4-3 5 4-3 4-2-1v11H8V10l-2 1-3-4z" />
  </Icon>
);
export const IconCrew = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16 14a5 5 0 0 1 6 5" />
  </Icon>
);
export const IconScroll = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3h11a2 2 0 0 1 2 2v12M6 3a2 2 0 0 0-2 2v2h4M6 3a2 2 0 0 1 2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2H10" />
    <path d="M11 8h5M11 12h5" />
  </Icon>
);
export const IconSpyglass = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12.5l11-5.5 2 4-11 5.5z" />
    <path d="M14.5 7l4.5-2.2 1.5 3-4.5 2.2" />
    <path d="M10 14.5l-3 6.5M10 14.5l3 6.5" />
  </Icon>
);
export const IconGear = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1A2 2 0 1 1 6.9 4.4l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </Icon>
);
export const IconFlame = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 22c-4 0-7-2.8-7-6.6 0-3.1 2-5 3.3-6.4.2 1.8 1 3 2.2 3.4C10 9 11.5 5.5 14 3c.3 3.4 5 5.9 5 12.3C19 19.2 16 22 12 22z" />
    <path d="M12 22c-1.7 0-3-1.2-3-3 0-1.5 1.2-2.6 2-3.4.3 1 1 1.6 1.7 1.7.2-1 .7-2 1.6-2.8.3 1.6 1.7 2.7 1.7 4.5 0 1.8-2 3-4 3z" />
  </Icon>
);
export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4l13 8-13 8z" />
  </Icon>
);
export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4v16M16 4v16" />
  </Icon>
);
export const IconStop = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </Icon>
);
export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const IconCabin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 11l9-7 9 7v10H3z" />
    <circle cx="12" cy="14" r="3" />
  </Icon>
);
export const IconDeck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 16h18l-3 4H6zM12 3v13M12 4l7 9h-7" />
  </Icon>
);
export const IconMic = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
);
export const IconCamera = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M16 10l5-3v10l-5-3z" />
  </Icon>
);
export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Icon>
);
export const IconRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4" />
  </Icon>
);
export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12l5 5L20 7" />
  </Icon>
);
export const IconSound = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11" />
  </Icon>
);
export const IconMute = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6" />
  </Icon>
);
export const IconAnchor = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v14M8 11h8M4 14a8 8 0 0 0 16 0" />
  </Icon>
);

/** A little doubloon, in color. */
export function Doubloon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#F2C14E" stroke="#8A6417" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" fill="#E3A82B" />
      <path d="M12 8.5v7M10 10.2c0-1 4-1 4 .3 0 1.5-4 .9-4 2.5 0 1.2 4 1.2 4 0" stroke="#8A6417" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
