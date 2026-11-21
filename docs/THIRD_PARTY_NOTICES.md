# Third-Party SDKs, Fonts, Assets & Compliance Notices

This document records third-party dependencies, external APIs, fonts, icons, and illustrations used in **Ship Pwedo Pomo**, alongside licensing and privacy compliance status.

## 1. Runtime Dependencies (`apps/web` & workspace packages)
| Package | License | Purpose | Privacy / Data Handling |
| :--- | :--- | :--- | :--- |
| `react`, `react-dom` | MIT | Client UI rendering | Local only; sends no telemetry. |
| `zustand` | MIT | Client state management & local persistence | Persists only under `ship:*` `localStorage` keys. |
| `firebase` (`firebase/app`, `firebase/auth`, `firebase/firestore`) | Apache-2.0 | Hosting, optional Google Sign-In (`GoogleAuthProvider`) and cloud sync for signed-in users (Cloud Firestore) | Activated only on explicit user sign-in after age/consent confirmation; Firestore loads only for signed-in users and stores their study data under their own account; no Google Analytics / tracking SDK enabled. |
| `pdfjs-dist` | Apache-2.0 | Local client-side PDF text extraction for Study Sheets | Runs 100% locally in a browser Web Worker; PDFs never leave the user's device unless the user explicitly sends study text to their own Gemini key. |
| `tailwindcss`, `@tailwindcss/vite` | MIT | Styling & OKLCH CSS variables | Build-time CSS generation only. |

## 2. Optional User-Supplied Integrations
- **Google Gemini API (`generativelanguage.googleapis.com`)**: Disabled by default. Activated only when the user supplies their own Google AI Studio API key in Settings; all JSON outputs pass runtime schema validation (`validateJsonSchema`).
- **Google Drive Sync (`accounts.google.com`)**: Disabled by default. Activated only when the user supplies their own Web OAuth Client ID and authorizes read-only Drive scopes.
- **Canvas, Todoist & Lodestar (`.ics` / `webcal://`)**: Disabled unless configured by the user. Credentials/feed URLs remain in browser `localStorage` only.
- **Lookout Chrome Extension**: Communicates strictly over same-origin `window.postMessage` after the user manually installs the unpacked Chrome extension.

## 3. Fonts, Icons & Artwork
- **Typography**: System serif stack (`ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`) — zero external font CDNs, zero Google Fonts IP tracking, commercial-safe system fonts.
- **Icons & Illustrations**: All line icons (`apps/web/src/components/icons.tsx`), pastel character badges (`PastelMinionBadge.tsx`), ship sprites, and Mr. Tiny Studio canvas artwork (`ship-engine/*.ts`) are original custom SVGs and Canvas 2D code authored specifically for Ship. No third-party stock packs or unmodified icon libraries are required at runtime.
