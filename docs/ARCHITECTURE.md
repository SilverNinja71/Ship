// Ship Architecture, User Flows, Schemas & Deployment Reference.

## 1. System Overview & User Flow
Ship (`ship-pwedo-pomo.web.app`) is a local-first student study workspace built with React 19, Zustand, HTML5 Canvas 2D, and Firebase Auth/Hosting:

1. **First Visit & Consent (`OnboardingModal.tsx`, `ConsentBanner.tsx`)**:
   - First-time visitors see the 4-step interactive tutorial and a browser-storage consent bar (`ship:storage-consent`).
   - All core tools work offline with zero account required.
2. **Focus Loop (`VoyageDock.tsx`, `voyageStore.ts`, `ShipCanvas.tsx`)**:
   - Clicking **Pwedo Pomo** switches the canvas to Pwedo playing and opens session/cycle configuration.
   - Starting cycles through three animated canvas phases: **Preparing** (minions clean the deck), **Focus** (`renderStudyDeskScene` with 3D desk + optional curated soundscapes that auto-pause for external audio), and **Break** (`renderBreakScene` + guided reflection).
3. **Active Recall & Study Sheets (`CaptainsLogPanel.tsx`, `captainsLogService.ts`, `FlashcardsPanel.tsx`)**:
   - Files uploaded via button or drag-and-drop (`.pdf`, `.docx`, `.pptx`, `.md`, `.txt`, `.parchment`) are parsed locally via `@ship/integrations`.
   - Blurts are graded offline by `@ship/active-recall-engine` or optionally with the user's Gemini API key (`generateGeminiJson` + runtime `validateJsonSchema`).
4. **Banana Planna & Monthly Stats (`BananaPlannaSection.tsx`, `PlannerPanel.tsx`, `MonthlyStatsModal.tsx`)**:
   - Tracks 4 daily items per weekday (1–4 numbered lists, auto-resetting Sunday 12:00 am local time via `checkAndResetWeek()`), habit check-ins, and monthly focus/streak carousel stats.

## 2. Client & Firebase Storage Schemas
| Store / Medium | Key / Name | Contents |
| :--- | :--- | :--- |
| `localStorage` | `ship:planner`, `ship:voyage`, `ship:recall`, `ship:economy`, `ship:settings`, `ship:fleet` | Zustand persisted state (planner grid, session history, flashcards, doubloons/unlocks, settings, calendar feed metadata). |
| `localStorage` (`accountData.ts`) | `ship:profile-name`, `ship:profile-email`, `ship:tutorial-seen`, `ship:signin-prompt-dismissed`, `ship:storage-consent` | Profile metadata, tutorial dismissal, and privacy consent state. |
| `IndexedDB` (`noteVault.ts`) | `ship-notes` (`notes` object store) | Full imported `NoteDocument` text/pages (kept out of `localStorage` to avoid the 5 MB quota). |
| Firebase Auth (`firebase.ts`) | Project `ship-pwedo-pomo` | Optional Google Sign-In (`GoogleAuthProvider`), gated by explicit 13+ and Privacy/Terms consent in `LoginModal`. Deleting account/data invokes `deleteUser()` + clears all `ship:*` keys + `clearNotes()`. |

## 3. Integrations & Schema Validation Boundaries
- **Pure Adapters (`packages/integrations/src/`)**: All network/document adapters (`canvas.ts`, `todoist.ts`, `lodestar.ts`, `googleDrive.ts`, `gemini.ts`, `geminiBlurt.ts`) accept an injected `FetchLike` parameter and never call global `fetch` directly inside UI components.
- **Strict AI JSON Validation (`validateJsonSchema` in `packages/integrations/src/gemini.ts`)**: `generateGeminiJson` parses candidate text and validates the decoded JSON object against declared `JsonSchema` definitions (`type`, `enum`, `required`, `properties`, `items`) before returning data to UI or offline merge logic.
- **Lookout Chrome Extension (`apps/extension/`)**: Synchronizes voyage focus state, flashcards, and doubloon rewards over same-origin `window.postMessage` (`useLookoutBridge.ts`) on `localhost`, `silverninja71.github.io`, and `ship-pwedo-pomo.web.app`.

## 4. Edge Cases & Deployment Configuration
- **Sunday 12:00 am Weekly Reset**: Checked both at store rehydration (`onRehydrateStorage`) and every 60s inside `BananaPlannaSection.tsx` using local timezone boundaries.
- **Mobile Safari Viewport**: Uses `100dvh` (`h-[100dvh]`, `min-h-[100dvh]`) so bottom `VoyageDock` controls stay visible when mobile URL bars expand.
- **Firebase Hosting & Auth (`firebase.json`, `.firebaserc`)**: Serves `apps/web/dist` with immutable caching for `/static/**`, SPA fallback rewrite to `/index.html`, and authorized OAuth handlers for `ship-pwedo-pomo.web.app`, `ship-pwedo-pomo.firebaseapp.com`, and `localhost:5173`.
