# Ship: notes for Claude, Gemini and the graphics AI

Read this first. It explains what Ship is, how the repo is laid out, the decisions already made, and what is left to build.

## What Ship is

A study app dressed up as a cartoon ship. You command a **Study Ship** and study at a desk on its deck or in the Captain's Quarters. A cartoon sailor avatar shows what you're doing. Focus timers are called **voyages**, and they pay **Doubloons** and XP. Crew rooms let friends study together, and the **Lookout** browser extension blocks distracting sites during a voyage.

Two pasted briefs shaped Ship:
- the **master blueprint** (2026-10-27), which set the features;
- the **monolithic specification** (2026-10-28), which split the work between three AIs and switched the art to sprites.

This file is the source of truth for the decisions made since then. Where the two briefs disagree, the 2026-10-28 one wins.

**Since 2026-11-16 the app looks and reads differently from most of this file.** A redesign gave it a pastel "Ink & Paper" look, renamed the main features (the focus timer is **Pwedo Pomo**, the planner is **Banana Planna**, the Captain's Log is **Study Sheets**) and added sign-in, a planner and a second web address. Read "The kawaii redesign" near the end before trusting the older sections about what's on screen. The code names (`voyage`, `log`, `CaptainsLogPanel`) didn't change.

## The user

- New to coding and wants to learn. Explain what you did in plain language and define jargon.
- Test pages only in Claude's **built-in browser pane**, never the user's own Chrome. Make no sound and open no pop-up windows. Ambient audio in the app must stay **off by default**.
- Mind the weekly usage cap: check usage between phases and stop well below it.

## Who does what (multi-AI pipeline)

The 2026-10-28 spec splits the work by specialty:

- **A graphics AI** (Midjourney, Recraft.ai or Imagen 3) makes **all ship and sailor art** as sprite assets: transparent PNGs or SVGs.
  - **Style:** clean cartoon/anime 2.5D side profile, with One Piece / Ghibli-style nautical charm, bold outlines and a warm palette. The designs stay original (see "Ships").
  - **Delivery:** modular, layered sheets with fixed pixel sizes and anchor points.
  - **Ship parts:** modular hulls (1000×300 px), mast and rigging mounts, sails (billowing and furled), flags, figureheads, cabin interiors, and deck foliage (the citrus tree: blooming, normal and wilted).
  - **Chibi sailor layers** (256×256 px): base body, skin tones, eye expressions, hair (front and back), outfits (coats, pirate hats, bandanas, aviator goggles) and desk tools (quill, laptop, tablet, logbook).
  - **Environments:** looping parallax wave layers (foreground, midground, background), cloud banks, and sky gradients (day, sunset, starry twilight, storm).
- **Claude** writes the code:
  - The monorepo and the contracts in `@ship/shared-types`.
  - The **sprite compositor** in `apps/web/src/ship-engine/` (built in session 4, in `sprites/`): preloading, scaling, anchor-point snapping, wave bobbing, parallax, hit regions, the avatar state machine and particles.
  - The algorithms (SM-2/FSRS, the `bplist00` parser, typed-answer grading), the signaling server and the stores.
  - **Claude no longer draws complex ships or characters with procedural Canvas code.** The procedural art built in session 3 is a stand-in until sprites arrive (see "Next steps").
  - The art brief for the graphics AI is `docs/art-brief.md`; the full sprite checklist is `docs/sprite-list.md` (generated).
- **Gemini** handles the AI judgement, with the user's own API key:
  - **The Lookout's second opinion** (built): the Lookout's own video groups (written in session 5, no AI) sort each YouTube video. Gemini reads the thumbnail, title, channel and description and decides PROCEED or BLOCKED only for videos the groups aren't sure about.
  - **Feynman "blurt diff" grading** (built in session 4): it decides which concepts in a blurt are mastered, partly grasped or missed, and flags statements the notes contradict. The key is the web app's own setting.

## Repo layout

npm workspaces + Turborepo + TypeScript. There is no build step for packages: each package's `exports` points straight at `src/index.ts`, and Vite, Vitest, tsx and esbuild all read TypeScript directly.

```text
ship/
├── apps/
│   ├── web/                 Vite 8 + React 19 + Tailwind 4 + Zustand 5. The main app.
│   │   ├── dev/             ships.html and avatars.html: art galleries (dev server only)
│   │   ├── public/assets/   the graphics AI's sprites: index.json + one folder per sheet (empty until art arrives)
│   │   ├── scripts/         assets.ts (checks the art, writes index.json and docs/sprite-list.md), spriteList.ts
│   │   └── src/
│   │       ├── ship-engine/ ShipCanvas.tsx (the frame loop), ShipRenderer.ts (main deck), QuartersRenderer.ts,
│   │       │                OceanEngine.ts, ParticleFX.ts, props.ts (helm, citrus tree, bell), hitRegions.ts,
│   │       │                draw.ts (style helpers), AvatarRenderer.ts + avatar/ (the sailors and desks),
│   │       │                sprites/ (the sprite loader and compositor: store, paint, ship, props, avatar, ocean),
│   │       │                tinyInk.ts (the Ink & Paper palette), minions.ts (the deck characters),
│   │       │                StudySceneRenderer.ts (the Pwedo Pomo, focus-desk and break scenes)
│   │       ├── ships/       types.ts (the art contract), index.ts (drawShip), one file per HullStyle, parts/, decor.ts,
│   │       │                tinyInkShip.ts (pastel palettes for the Shipwright's previews)
│   │       ├── components/  Hud (top bar, login), VoyageDock (the Pwedo Pomo pill), PanelHost, ui kit, icons,
│   │       │                StudyMaterialsSection + BananaPlannaSection (the page below the scene),
│   │       │                OnboardingModal, ConsentBanner, LegalModal, BreakReflectModal, MonthlyStatsModal,
│   │       │                AudioBrowserModal, PastelMinionBadge,
│   │       │                panels/ (Helm, Planner, Captain's Log, Flashcards, Shipwright, Wardrobe, Crew,
│   │       │                Fleet Log, Lookout, Settings)
│   │       ├── stores/      voyageStore, economyStore, shipCustomizer, recallStore, fleetStore, crewStore,
│   │       │                settingsStore, uiStore, activityStore, lookoutStore, plannerStore
│   │       ├── hooks/       useVoyageTicker, useIdleDetection, useKeyboard, useAmbiance, useLookoutBridge,
│   │       │                useCrewSync, useWebRTC, useAutoSync
│   │       └── lib/         voyageLogic (the timer's rules), format, network, audio, rtcMesh, ids, storage,
│   │                        hosting, backup, noteVault, blurtGrading, firebase (Google sign-in), accountData
│   │                        (profile, consent, delete everything), captainsLogService (hashtags), plannerExport
│   ├── extension/           "The Lookout", Chrome Manifest V3, bundled with esbuild (build.mjs)
│   │   └── src/ background/ content/ popup/ options/; core/videoGroups.ts + videoSort.ts sort watch pages
│   └── signaling-server/    Node + ws: crew rooms, quest damage, WebRTC signaling, /relay
├── docs/                    art-brief.md (for the graphics AI), sprite-list.md (generated: every sprite, size, anchor),
│                            ARCHITECTURE.md, FUTURE_DRAFTS.md and THIRD_PARTY_NOTICES.md (from the redesign)
├── firebase.json, .firebaserc   Firebase Hosting for the second web address (see "The kawaii redesign")
└── packages/
    ├── shared-types/        THE CONTRACTS. Every app and package agrees on these shapes.
    ├── ship-theme-kit/      ship registry, parts catalogs (sails, figureheads, flags, desks), avatar catalog, prices,
    │                        sprite sheet specs + manifest validation (sprites.ts)
    ├── active-recall-engine/ SM-2 + FSRS schedulers, typed-answer grading, blurt diff engine
    └── integrations/        adapters: Canvas, Todoist, Lodestar, Google Drive, Parchment (.parchment), CSV cards,
                             and the Gemini client (gemini.ts) + Gemini blurt grader (geminiBlurt.ts)
```

Commands (run from the repo root):

```bash
npm install          # once
npm run dev          # web app on http://localhost:5173 + crew server on :8787 + extension watch build
npm test             # every package's Vitest tests
npm run typecheck    # tsc (TypeScript 7) across the repo
npm run build:site   # the public website in apps/web/dist, with the Lookout as lookout.zip
npm run assets -w @ship/web   # check the graphics AI's sprites; rewrite assets/index.json and docs/sprite-list.md
```

Package names: `@ship/shared-types`, `@ship/ship-theme-kit`, `@ship/active-recall-engine`, `@ship/integrations`, `@ship/web`, `@ship/extension`, `@ship/signaling-server`.

## Status (2026-11-21)

Everything below is on `main`:
- pull request #1: sessions 1–3;
- pull request #2: the CLAUDE.md rewrite, the sprite contracts, the sprite compositor and Gemini blurt grading;
- pull request #3: the Lookout's video groups;
- pull request #4: the public website (see "The public website");
- pull request #5: uploading coursework, links and images, and matching Parchment's schedule (see "Uploading coursework");
- 13 commits pushed straight to `main` on 2026-11-16 to 2026-11-18, with no pull request: the kawaii redesign (see "The kawaii redesign"). This file wasn't updated then. That section was written on 2026-11-20 by reading the code, so it records what the code does, not why each choice was made;
- pull request #6: this file's notes on the redesign.

Cloud sync and the backup fix (see "Cloud sync") are on branch `claude/cloud-sync`.

Every build step now has working code:
- **`packages/shared-types`**: every contract.
  - Ships and avatars (`ship.ts`), voyages and economy (`voyage.ts`), flashcards and blurt (`recall.ts`), integrations and the relay (`integrations.ts`), the crew wire protocol (`crew.ts`), and the extension bridge (`lookout.ts`).
  - Session 2 added the `swing` extra, `Inventory`, `newReviewSchedule()`, `BLURT_STATUS_COLORS` and `ImportResult.assignments`.
- **`packages/ship-theme-kit`** (step 1), **`packages/active-recall-engine`** (step 2), **`apps/signaling-server`** (step 5) and **`packages/integrations`** (step 6), all with tests.
- **`apps/web`** (step 3), session 3: the scene engine, the 16 ships' artwork and the chibi sailors (both procedural, to be replaced by sprites), every store and every panel. Details below.
- **`apps/extension`** (step 4), session 3: the Lookout. Details below.
- **Sprites** (session 4): the contracts (`shared-types/sprite.ts`), the sheet specs and manifest checks (`ship-theme-kit/sprites.ts`), the compositor (`apps/web/src/ship-engine/sprites/`), the asset check script and the art brief. No art has arrived yet, so everything still draws procedurally. Details in "Decisions made in session 4".
- **Gemini blurt grading** (session 4):
  - the shared Gemini client and the blurt grader, in `@ship/integrations`;
  - the key setting in the web app's Settings;
  - async grading in the Captain's Log, falling back to the offline engine.

  The Lookout now uses the same client.
- **The Lookout's video groups** (session 5): rules written ahead of time that sort YouTube videos without Gemini. Details in "Decisions made in session 5".

`npm test` runs 876 tests, and all pass (run on 2026-11-21):

| Package | Tests |
|---|---|
| ship-theme-kit (catalogs 22, sprite specs 14) | 36 |
| active-recall-engine (incl. Parchment's schedule 24) | 65 |
| crew server | 100 |
| integrations (incl. Gemini client and blurt grader 16, uploaded documents 31, links and images 34) | 185 |
| extension (incl. video groups 25) | 187 |
| web (ship art 147, sailor art 68, stores and voyage rules 26, sprite engine 11, hosting 11, asset checks 6, Gemini grading, flashcard questions and backups 14, Ink & Paper palette 4, cloud sync rules 16) | 303 |

`npm run typecheck` passes for all 7 workspaces, and `npm run build:site` builds.

**The redesign has almost no tests.** It added about 7,000 lines of code and 5 tests (the palette and the Gemini schema check). The planner, the Pwedo Pomo cycles, sign-in, the consent bar and data deletion have none.

**Verified in session 3** with Playwright's headless Chromium (muted, no pop-ups). Claude Code cloud sessions have no built-in browser pane, so this is the stand-in. Never use the user's own Chrome.
- Screenshots of the deck, the quarters, every panel and a phone-sized layout, with sample data.
- Two browser contexts in one crew room against the real crew server: presence, a shout, and a crewmate at the galley table.
- The built extension loaded into Chromium with the real web app: it connects, the Siren Gate blocks a (faked) YouTube home page during a voyage, and steering back pays exactly 50 doubloons once.

**Verified in session 4** with throwaway placeholder sprites (plain shapes, deleted afterwards, never committed) for the Woolly Wanderer, square sails, the ram, the Sun-Hat Skull, the citrus tree, the Captain's Desk, the galley table, the starter sailor and the tropical sea:
- They passed `npm run assets`.
- On the deck: the hull layers and rigging line up with the layout markers, sails are furled when docked and billow under sail, and the flag waves.
- The sailor is tinted and posed in all three states and all break activities. Sailors without a complete set stay procedural, and the procedural helm and bell sit beside sprite parts.
- The quarters' cabin-room sprite shows the sea through its porthole.

**Gemini grading, verified in session 4** with Gemini's answers faked by Playwright's network interception (no real key and no call to Google):
- Settings saves the key and **Check key** works.
- The Captain's Log shows "Grading with Gemini…", then Gemini's grade (72% on the respiration sample), its advice and the misconception it caught.
- A faked HTTP 429 falls back to the offline grade (19%) with a note saying why.
- The key only ever travels in the `x-goog-api-key` header, never in a URL, and backups don't contain it.
- Gemini's real API answers a browser preflight from `http://localhost:5173` with CORS allowed, so direct calls from the page work.

**Never checked for real:**
- A real Canvas, Todoist or Drive account, a notebook or `study.json` from the actual iPad, real YouTube, or a real Gemini key (for the Lookout or for blurt grading).
- Whether YouTube watch pages still carry `<meta itemprop="genre">`, the category the video groups read. YouTube was unreachable from the cloud sandbox. Without it the groups simply ignore the category.
- The Lookout's options page has a **Check key** button for Gemini.

Installed versions: firebase 13.4 (added by the redesign), pdfjs-dist 6.4 (exact, a month old when added), fflate 0.8.3, turbo 2.11, typescript 7.0, vitest 5.0, vite 8.3, @vitejs/plugin-react 6.1, react 19.3, tailwindcss + @tailwindcss/vite 4.3, zustand 5.0, ws 8.22, tsx 4.23 (crew server and web scripts), esbuild 0.28, @types/chrome 0.3, @types/node 26.6.

## Next steps (from the 2026-10-28 spec)

**Ask the user before picking these up.** The redesign went another way: it drew new characters and scenes in code, where the spec says a graphics AI supplies all art as sprites and Claude draws none. Nothing records which plan the user now wants (see "Open questions" under "The kawaii redesign").

Do these in order.

1. ✅ **Lock the sprite contracts** (session 4). See "Decisions made in session 4".
   - The shapes are in `shared-types/sprite.ts`: `SpriteRef`, `SpritePlacement`, `SpriteManifest` and the layer names.
   - The sheet specs (sizes and anchors) and `validateManifest` are in `ship-theme-kit/sprites.ts`.
2. ✅ **Sprite compositor** (session 4). Each part draws its sprite when its set is complete, and its procedural art otherwise.
   - It kept bobbing, parallax, particles, hit regions, the three avatar states, and the `drawShip`, `HullLayout` and `AvatarRenderer` APIs.
   - **Still to do:** once a ship or sailor layer has a complete sprite set *and the user is happy with it*, delete its procedural code.
3. **Asset pipeline (the graphics AI).** The brief is written: `docs/art-brief.md`, plus the generated checklist `docs/sprite-list.md`.
   - **The starter pack**, all on transparent backgrounds with anchors in the manifests:
     - the Woolly Wanderer's hull layers and rigging;
     - the square sails, billowing and furled;
     - the ram figurehead and the Sun-Hat Skull flag;
     - the citrus tree in its three states, plus a fruit and a blossom;
     - the starter sailor's layers and the Captain's Desk.
   - **When art arrives:** put it in `apps/web/public/assets/<sheet>/` with a `manifest.json`, run `npm run assets -w @ship/web`, then `npm test`, then look at it in the galleries.
4. **The Lookout (Gemini).** Built in session 3. Since session 5 its own video groups decide most videos, and Gemini only the unsure ones. It still needs testing on real YouTube, and with a real key.
5. ✅ **Gemini blurt grading** (session 4). See "Gemini blurt grading" under "Decisions made in session 4". It still needs a try with a real key; Settings has a **Check key** button.

Also still to do: try everything with real accounts and files (see "Never checked for real" above).

## Build plan (the original seven steps, all done)

1. ✅ **ship-theme-kit**: the 16 ships below as `ShipDefinition`s, the parts catalogs, the avatar catalog, prices and level gates, and a `validateLoadout()`.
2. ✅ **active-recall-engine** (with tests):
   - SM-2 that copies Parchment's `ReviewSchedule.next()` exactly. Ratings 1–2 reset the card and bring it back in 1 or 10 minutes. Ease = max(1.3, ease + 0.1 − (5−q)(0.08 + (5−q)·0.02)).
   - FSRS-4.5 with the default weights. Rating mapping: 1–2 → Again, 3 → Hard, 4 → Good, 5 → Easy.
   - Typed-answer grading (normalize, token overlap + Levenshtein) that suggests a rating.
   - Blurt diff: pull weighted key concepts out of reference notes, then fuzzy-match the blurt against them to get mastered / partial / missed and a coverage score. Mastered shows seafoam green; missed shows coral red.
3. ✅ **web app** (see "Web app design" and the session 3 notes).
4. ✅ **Lookout extension** (see "Lookout design" and the session 3 notes).
5. ✅ **signaling server** (see "Crew server design").
6. ✅ **integrations** (see "Integrations").
7. ✅ Verify: unit tests, screenshots in a headless browser (muted), crew rooms with two tabs, and the extension's Siren Gate dev page (`apps/extension/dist/dev/gate.html`, served over http) with a fake `chrome` object.

## Ships (original names on purpose)

The brief named One Piece ships (Going Merry, Thousand Sunny, Baratie, Polar Tang, Red Force) and "Nami's Orange Grove". Those names and designs belong to Eiichiro Oda/Shueisha/Toei. Ship uses **original ships that keep the same vibe**, so the app is safe to share. Don't reintroduce the trademarked names.

Buccaneer Fleet (the One Piece-inspired set):
- **Woolly Wanderer**: the free starter ship. A small caravel with a smiling ram figurehead, a grassy lawn deck and a rustic wooden cabin.
- **Golden Mane**: a sunny brigantine with a lion sunburst figurehead, a lawn deck and a mast swing.
- **Floating Galley**: a fish-shaped ocean kitchen barge with fin stabilizers and a smoking chimney.
- **Sunfish**: a round yellow submersible with brass portholes and a periscope.
- **Crimson Corsair**: a deep red galleon with brass cannons and velvet captain's quarters.

Navy & Military:
- **Admiralty Battleship**: white and navy steel, turrets.
- **Ironwood War Galleon**: an 18th-century three-master with gun ports.
- **Riveted Ironclad**: low sloped casemate and one stack.
- **Thunder Dreadnought**: brass telescopes and a war-room desk.

Mythic (names from the brief, all generic or public-domain):
- **Pegasus Celestial Cloud-Galleon**: wings, feathered sails, a twilight cloud sea and stardust effects. Aviator goggles suit it.
- **Merfolk Coral Caravel**: bioluminescent coral rails, and deck orange trees that drop zest coins when clicked.
- **Chalkydri Solar Ark**: 12 fiery sails, brass astrolabe, stained-glass solarium.
- **Alebrijes Spirit Galleon**: neon folk-art chimeras, papel picado sails, paper lanterns, copal smoke.
- **Kaiju Behemoth Carrier**: a scrap barge with a friendly leviathan swimming alongside in neon mist.
- **Gorgon Stone Trireme**: marble deck, oars, ivy, olive leaves.
- **Sasquatch Cedar Timber-Brig**: redwood logs, a cabin woodstove, pine needles.

**Decided (2026-10-28):** the 2026-10-28 spec lists only five Mythic ships, but the user chose to **keep** the Gorgon Stone Trireme and the Sasquatch Cedar Timber-Brig. All 16 ships stay.

## Web app design

This is the original design. It still describes the **Full Color (Storybook)** style exactly. The default style is now **Ink & Paper**, which hides or replaces several of these parts (see "The kawaii redesign").

- **Rendering**: Canvas 2D, a side-on cartoon "2.5D" view. The deck is drawn as a thin top-down band so avatars can stand on it.
  - **Ships, sailors and scenery are composed from the graphics AI's sprite layers.** Until those exist, the procedural art from session 3 fills in (see "Next steps").
  - Ship local units: length 1000, deck at y=0, keel at about +140, mast tops at about −560. Scale to fit the viewport.
  - Animate the hull bob, waves (layered sines with parallax), drifting clouds, billowing sails, a waving flag and flickering lanterns.
  - Use hit-regions for interactive parts, recomputed each frame:
    - The **Helm** opens the Navigation Map (itinerary and deadlines).
    - The **citrus tree** blooms while a voyage runs and wilts if one is abandoned early. When ripe, clicking it drops zest coins.
    - The **Ship's Bell / Crow's Nest** rings break chimes. Sound is off by default.
- **Two camera views**:
  - **Main Deck** shows the whole ship, with crew avatars at adjacent galley tables.
  - **Captain's Quarters** is a zoomed cabin interior: a porthole showing the environment, the desk, a lantern, bookshelves and one themed decor item per ship.
- **Avatar**: chibi, built from layers (back hair, body/coat, arms by pose, head, face, front hair, hat, accessory, desk tool). It has three states:
  - `SAILING_FOCUS`: writing or typing at the desk.
  - `SHORE_LEAVE_BREAK`: boba or tea, stretching, or using a spyglass.
  - `DRIFTING_IDLE`: head on the desk with "Zzz" bubbles. It switches here after no input for N minutes, or when the tab is hidden mid-voyage.
- **Voyages**: Coastal 25/5, Ocean 50/10, or a custom length. Each focused minute pays 2 doubloons and 10 XP, and a completed voyage adds +25. Streaks count by calendar day. Records feed stats and ghost ships.
- **Crew quests**: a room's focus minutes deal damage to the current beast (Procrastination Kraken first). Defeating it unlocks a figurehead for the whole crew.
- **Ghost ships**: a friend's session timeline replays as a translucent avatar when they're offline.
- **Storage**: Zustand `persist` to localStorage for now.

## Lookout design (apps/extension)

- **Bridge content script** on the Ship web app (`http://localhost/*`, `http://127.0.0.1/*` and, since the redesign, `https://silverninja71.github.io/*`, `https://ship-pwedo-pomo.web.app/*` and `https://ship-pwedo-pomo.firebaseapp.com/*`; only active if `<meta name="ship-app">` is present). It relays the voyage state and a few due flashcards to the extension, and sends reward events back. The messages are the `WebToLookout` / `LookoutToWeb` types in `shared-types/lookout.ts`. The web app pays each reward event once (by id), then acks it.
- **Guarding** happens only while a focus block runs:
  - YouTube home, Shorts and feeds are always blocked.
  - A YouTube watch page is first sorted by the Lookout's **video groups** (session 5): subjects, lessons, study audio and distractions, written ahead of time, with no AI and no network.
  - Only when the groups aren't sure, and a key is set, does **Gemini Flash** judge it: from its title, channel, description, YouTube category, an optional transcript excerpt and the thumbnail, checked against the active assignment. Gemini verdicts are cached per video.
  - **The answer's shape:** the spec writes it as `{ "verdict": "PROCEED" | "BLOCKED", "confidence": number, "reason": string }`. The code asks Gemini for `decision` instead, to match `LookoutVerdict.decision` in shared-types, and accepts either name. (Since the redesign's schema check, only `decision` gets that far; see "Gemini" under "Integrations".)
  - With no API key, the video groups decide everything, and their verdicts are labeled as such ("Sorted by the Lookout's video groups, not Gemini").
- **Gemini setup**: the user types their own key on the options page. The model name is a setting, because Gemini model IDs change. Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with header `x-goog-api-key`, using `responseMimeType: application/json`. The call itself goes through the shared client in `@ship/integrations` (`generateGeminiJson`); the Lookout's prompt and verdict parsing stay in `apps/extension/src/core/gemini.ts`.
- **Siren Friction Gate**: a Shadow-DOM overlay with a cartoon pirate. It offers two choices:
  - Answer 2 flashcards correctly (typed) for a 5-minute leisure pass.
  - Steer back to the ship for +50 doubloons.
- **Popup** shows the voyage status and today's stats. The **options page** holds the Gemini key, the model, the Ship URL and the blocked sites.

## Crew server design (apps/signaling-server)

- `ws` on port 8787 (`SIGNALING_DEFAULT_PORT`), speaking `ClientMessage` / `ServerMessage` from `shared-types/crew.ts`.
- Rooms hold up to 8 members. The server assigns seats, broadcasts presence and adds up focus-tick damage on a server-side `QuestState` per room. It relays WebRTC offers, answers and ICE between peers, so the WebRTC calls run as a mesh (each browser connects to every other). It also relays shouts, with rate limits.
- `POST /relay` (`RelayRequest` → `RelayResponse`) exists because Canvas blocks browser requests (no CORS). It accepts only localhost origins and forwards only to allowlisted hosts: `*.instructure.com`, hosts in a `CANVAS_HOSTS` env var, `api.todoist.com` and `lodestarplanner.com`.
- `GET /health`.

## Integrations (packages/integrations)

Every adapter takes a `FetchLike` (see `shared-types/integrations.ts`) instead of calling `fetch` directly.

- **Canvas** works with a personal access token and base URL. It reads:
  - courses from `/api/v1/courses?enrollment_state=active`
  - assignments from `/courses/:id/assignments?include[]=submission`
  - group weights from `/courses/:id/assignment_groups`
  - course colors from `/users/self/colors` (the closest thing to Better Canvas colors)
  - nicknames from `/users/self/course_nicknames`

  Pagination follows the `Link` header. Calls go through `/relay`. The user's existing extension at ~/Downloads/lodestar-canvas-extension shows how they already call Canvas.
- **Todoist**: REST with a token.
- **Lodestar** (lodestarplanner.com, the user's own planner): the only known endpoints are its extension ones (`/api/extension/auth/session`, `/api/canvas/sync`, ...). **There is no known task-read API.** Don't invent one. Ask the user, or support importing a calendar feed or export instead.
- **Google Drive**: Drive v3 `files.list` plus Google Docs export to text, with an OAuth access token from Google Identity Services. The user must supply their own OAuth client ID.
- **Parchment** (the user's iPad notes app, ~/Downloads/Parchment):
  - A `.parchment` file is a **binary property list** (`bplist00`) of `NotebookArchive { magic: "parchment-archive", version, notebook, drawings, pdf?, coverImage? }`. Text lives in `notebook.pages[].textBlocks[].text`, and the subject in `notebook.subject`. Handwriting that was never converted to text isn't in the file.
  - Write a small DataView bplist parser (no Node `Buffer`; it must run in the browser).
  - Flashcards live in Parchment's `study.json` (`{ decks, cards, pageSchedules, reviewLog }`). Swift `JSONEncoder` writes its dates as seconds since 2001-01-01.
- **Paper** (the user's art app, ~/Downloads/ForgePaper): undecided. Probably imports exported text or images only.
- **CSV/TSV** flashcard import.
- **Gemini** (`gemini.ts`): the shared client for every Gemini call: URLs, model-id cleanup, timeouts, refusals and loose JSON parsing. Any failure becomes a `GeminiError`. `geminiBlurt.ts` grades Captain's Log blurts (see session 4).
  - Since the redesign, `generateGeminiJson` also checks the answer's shape with `validateJsonSchema`, against the request's own `responseSchema` (or a schema passed in). A wrong type, a missing required field or a value outside an `enum` becomes a `GeminiError`, so callers fall back as they do for any failure. The check is lenient in two places: enum values match in any letter case, and a number written as a string passes.
  - **It runs before each caller's own forgiving parser, so two older leniencies no longer apply.** A Lookout answer that says `verdict` (or `ALLOW`, `BLOCK`) fails the check, and the video groups decide. One blurt idea with a bad status or a missing field fails the whole answer, and the offline grade is used for everything; ideas Gemini simply leaves out are still fine. Gemini normally follows a `responseSchema`, so this should be rare. It hasn't been seen with a real key.

## Decisions made in session 2

### ship-theme-kit
- **Starter items** (everyone owns them):
  - Ship and parts: the Woolly Wanderer, square sails, bare masts, the ram figurehead or none, the Sun-Hat Skull flag and the Captain's Desk.
  - Avatar: every skin tone and hair style, the straw hat, bandana or no hat, the striped shirt or hoodie, glasses or nothing, and the quill & logbook or laptop.
- The `straw-skull` flag is shown as the **Sun-Hat Skull**: a skull in a sun hat over crossed quills. Don't draw the Straw Hat Jolly Roger.
- **Quest figureheads** (kraken, dragon, mermaid, swordfish) can't be bought. When a crew wins one, it goes into `Inventory.parts` as `figurehead:kraken`.
- A ship's own default parts work on that ship without buying them, but not on other ships.
- **What fits where:**
  - Sails only fit ships whose default sails aren't `none`, so engine ships and the Sunfish always have bare masts.
  - Figureheads only fit hulls in `FIGUREHEAD_HULLS`. The submarine, battleship, dreadnought and ironclad don't take one.
- Level gates apply when buying (`checkPurchase` and friends), not when equipping (`validateLoadout`).
- Prices assume about 75 doubloons per 25-minute voyage.
- `ENVIRONMENTS` holds the sky and sea palette for each environment. `CABIN_DECOR` names each ship's themed cabin item.

### active-recall-engine
- **SM-2 copies Parchment's `ReviewSchedule.next()`**, checked against the Swift on 2026-11-03 (see "Uploading coursework"). The earlier guess at classic SM-2 was wrong for Hard and Easy.
- **FSRS:**
  - A lapse never raises stability; it's capped at the previous value.
  - Cards first reviewed under SM-2 start from stability = interval, with a difficulty mapped from ease.
  - There is no interval fuzz.
  - The SM-2 ease keeps updating, so a deck can switch schedulers safely.
- **Typed grading:**
  - Correct means a score of at least 0.9, and close at least 0.7.
  - Suggested rating: correct → 4 (5 if exact and answered within 5 s), close → 3, otherwise 2 or 1.
  - Numbers must match exactly, and a flipped "not" caps the score.
- **Blurt:**
  - Concepts come from heuristics, with no dictionary and no AI.
  - Mastered means a score of at least 0.75, and partial at least 0.34.
  - Coverage counts mastered as 1, partial as its score and missed as 0.
  - `annotateNotes` and `annotateBlurt` return text spans for coloring.

### signaling-server
- `HOST` defaults to `127.0.0.1`, so only this computer can connect. For friends on other machines, run with `HOST=0.0.0.0`. The relay still serves only this computer.
- **Who gets which message:**
  - `welcome.members` includes the joiner.
  - `member-updated`, `quest` and `shout` go to the whole room, sender included.
  - `member-joined` and `member-left` go to everyone else.
- Room names are lowercased and must be 1–32 characters of a–z, 0–9 and inner dashes.
- **Quests:**
  - Focus ticks are clamped to the time the member has actually spent in the room, plus 15 s of slack.
  - One tick defeats at most one beast.
  - Hp can be fractional, so show it with `Math.ceil`.
  - Quest state lives in memory and is lost on restart.
- **`/relay`:**
  - An HTTP 200 reply means the upstream answered, with its real status inside the `RelayResponse`. Any other HTTP status means the relay refused, with an `{ error }` body.
  - Requests must be POSTed as `application/json`.
  - Only these request headers are forwarded: `authorization`, `content-type`, `accept`, `accept-language` and `x-request-id`.
  - The login token is dropped when a redirect changes host, so a school's Canvas base URL must be its final domain.

### integrations
- **`importFile(name, data)`** is the entry point for dropped files: `.parchment`, `study.json`, `.csv`/`.tsv`/`.txt`, `.ics`, `.docx` and `.pptx`. **`importFileAsync`** does the same and also reads PDFs; the web app always uses that one.
  - It never throws; problems come back as `warnings`.
  - `ImportResult` now has `assignments`, for `.ics` files.
- **IDs and dates:**
  - IDs are `${source}:${remoteId}`. Parchment cards with no deck go into a `parchment:unfiled` deck.
  - A date with no time means the end of that local day.
- **Canvas** (`syncCanvas(createRelayFetch(crewServerUrl), settings)`):
  - The base URL is cleaned up: `https://` is added, and `http://` is refused.
  - Group weights are read only when the course has `apply_assignment_group_weights`.
  - If the course list fails, or any call returns a 401, the sync throws. Everything else becomes a warning.
- **Todoist** uses the unified API v1 (`https://api.todoist.com/api/v1`, cursor paging).
  - The docs site wasn't reachable, so the shapes come from the official `@doist/todoist-sdk` types.
  - A task's `deadline` wins over its `due`.
- **Lodestar** is imported only from an ICS export or feed (no API was invented). Recurring ICS items are imported once, with a warning.
- **Plain text:** a `.txt` or `.md` file that isn't cards becomes a note with `source: "file"`.

## Decisions made in session 3

### Web app: how the pieces fit
- **Scene loop:** `ShipCanvas.tsx` runs one `requestAnimationFrame` loop. It reads the stores with `getState()` every frame, so React doesn't re-render per frame.
- **Each frame draws** sky → scenery → clouds → back waves → the ship (bobbing and tilting with the surface) → front waves → particles. Click regions are rebuilt every frame from the canvas transform.
- **Ship art contract** (`src/ships/types.ts`):
  - `shipLayout(ship)` gives the deck range, waterline, mast spots, bow, flag top, and the helm, citrus tree, bell, desk, crew tables, smoke points and orchard. It may also give `surfaces` and `bounds`; the camera fits the ship to `bounds`.
  - `drawShip(ctx, ship, loadout, frame, onDeck)` draws back → sails → deck → `onDeck` (props and sailors) → front → figurehead → flag.
- **Sailor art contract** (`AvatarRenderer.ts`):
  - `drawStudyStation` draws a sailor behind their desk (3/4 front view). It takes `opacity` (ghosts use 0.45) and `scale` (the quarters use 2.05).
  - `drawGalleyTable` seats two crew. `drawAvatarPreview` is for panels.
  - `GALLEY_SEAT_X`, `HEAD_TOP` and `GALLEY_SEAT_SCALE` say where to put name tags.
- **Units:** ship units are scaled to pixels by a camera, and everything else is CSS pixels. Name tags keep a fixed on-screen size.
- **Art galleries:** `/dev/ships.html` (with `?ship=`, `?still=1` and `?markers=1`) and `/dev/avatars.html` (with `?still=1` and `?t=`).
  - Run extra dev servers with `VITE_CACHE_DIR=<dir> npx vite --port <n> --strictPort`, so they don't share Vite's cache.
  - Never pass `--open` to Vite: it treats the next word as a page to open in a browser.

### Web app: rules
- **Voyages pay as they go.** Each whole focused minute pays 2 doubloons and 10 XP, and finishing adds +25. Abandoning keeps what was already paid, but wilts the citrus tree.
- **Timing comes from timestamps** (`lib/voyageLogic.ts`), not from counting ticks, so a throttled background tab can't drift.
- **A hidden tab keeps the voyage running.** The avatar shows `DRIFTING_IDLE`, but the Lookout must keep guarding then, because that's when the user is on YouTube.
- **Idle:** no input for `idleMinutes` (default 10; 0 turns it off) *while Ship is visible* pauses the voyage (phase `drifting`), and any input resumes it.
- **The citrus tree** ripens one fruit per 10 planned minutes of a completed voyage, and each fruit pays `ZEST_COIN_VALUE`. Abandoning a voyage wilts it until the next voyage starts.
- **Streaks** count consecutive local days with a completed voyage. Yesterday's streak stays alive until today ends.
- **Saved data:** every store persists under a `ship:` key in localStorage. Settings has backup, restore and "start over".
- **Sound:** WebAudio synthesizes a sea ambience and bell chimes, with no audio files. The `AudioContext` is only created after the user turns sound on; it's off by default. (The redesign added more synthesized soundscapes; see "Sound" under "The kawaii redesign".)
- **Crew calls:** mic and camera are off until the user toggles them, and friends' voices stay muted until "Hear crew" is clicked.
  - Every pair of crewmates connects directly ("mesh"), using perfect negotiation and Google's public STUN server.
  - Ghosts are recorded from crewmates' state timelines when they leave (at least 60 s), and replay at galley tables while they're away.
- **Network:**
  - Canvas always goes through the crew server's relay.
  - Todoist tries the browser first, then the relay.
  - Google Drive uses Google Identity Services' token client with the user's own client ID. Its sign-in window only opens from a click.
- **Not copying One Piece:**
  - The default sailor's straw hat has a **blue** ribbon, with brown hair and a blue shirt.
  - The Sun-Hat Skull flag (a teal-banded sun hat over crossed quills) is restyled so it can't be mistaken for the Straw Hat Jolly Roger.

### Web app: art (interim procedural art)

This art is drawn in code. The 2026-10-28 spec replaces it with the graphics AI's sprites; keep it as the fallback until each sprite set is complete. Its layout points (helm, citrus tree, desk, tables, `bounds`) are a good starting point for the sprite anchors.

- **Ship art files** (`src/ships/`):
  - One file per hull family, with shared helpers in `kit.ts`, `hullKit.ts` and `warship.ts`.
  - `parts/` holds the sails, figureheads, flags, extras and the leviathan; `decor.ts` holds the 16 cabin items.
  - `drawShip` never draws sails or figureheads on a ship that can't carry them, whatever the loadout says.
- **Layouts:**
  - Raised decks are real surfaces: stern castles at about −54 to −84 (y is up-negative), the Floating Galley's roof terrace at −124, the Sunfish's conning tower at −128 (helm and tree), and the ironclad's casemate roof at −136 (desk and two tables).
  - On citrus-tree ships, orchard trees take a table's space: Woolly has 3 tables plus 1 orchard tree, and Merfolk 2 plus 2.
  - The bell hangs over the helm.
  - On engine ships, the signal mast starts at the bridge roof.
  - Waterlines run from 44 (ironclad) to 118 (Pegasus). `bounds` reaches x 660 for the Kaiju's leviathan.
- **Sun-Hat Skull flag:** a lilac sun hat with a teal band and a daisy, a winking skull in round gold glasses, and teal crossed quills.
- **Figureheads** are fixed-size; `drawFigurehead` already takes a scale if small hulls need one.
- **Sailor art** (`src/ship-engine/avatar/`):
  - Built from layers: back hair, coat, desk, arms, face, front hair, hat, accessories, tool, then the hands over the tool.
  - Break activities rotate every 6.5 s (sip, stretch, spyglass) in a per-sailor order.
  - `GALLEY_SEAT_X` is 40.
- **Ghost cost:** ghosts fade as one layer through a cached offscreen canvas. On this machine's CPU-only headless Chromium, a station costs about 2.6 ms at deck size, and the ghost layer adds almost nothing there; at 2.5× it adds about 3.7 ms. If a full deck is slow on real machines, cache each sailor's head as a bitmap.
- **Load time:** the production bundle was about 630 kB (207 kB gzipped). After the redesign it is about 940 kB (298 kB gzipped, built 2026-11-20); the Firebase sign-in code loads for every visitor, signed in or not. If it matters, code-split the panels with `React.lazy` and load Firebase only when someone opens Log in. Cloud sync is already split off: its code and Firestore (about 144 kB gzipped) load only for signed-in sailors.

### Lookout extension
- **Internals:**
  - Logic with no Chrome calls lives in `src/core`. The worker logic in `src/background/lookout.ts` gets Chrome passed in, so tests can fake it.
  - State lives in `chrome.storage.local`, and every change runs under a lock. A one-minute alarm handles staleness, the midnight reset, passes and the toolbar badge.
- **Permissions:**
  - `storage`, `alarms` and `scripting`.
  - Hosts: YouTube, `i.ytimg.com`, Gemini, and `http://localhost/*` / `http://127.0.0.1/*` (every port). Later additions: `silverninja71.github.io` (the public website) and the two Firebase addresses (the redesign).
  - User-added sites use optional host permissions, requested from the options page.
- **Bridge rules the web app follows:**
  - Treat any Lookout `hello` as connected, and re-send `voyage` and `cards`.
  - Keep `guarding: true` while the Ship tab is hidden.
  - Send a heartbeat at least every 3 minutes (the extension stops guarding after 3 minutes without one, or 2 minutes after `endsAt`).
  - Each `cards` message replaces the set (at most 50).
  - Pay each reward id once, then ack it.
- **Rewards:** `steer-back` pays 50, or 0 if one was already paid in the last 10 minutes. `blocked` and `gate-passed` pay 0.
- **What it blocks:**
  - YouTube home, Shorts, `/feed/*`, gaming, trending and hashtag pages.
  - Search, channels and playlists are allowed.
- **Gemini:**
  - The default model is `gemini-flash-latest`; it's never been called with a real key, so check it with the options page's Check key button.
  - Only Gemini verdicts are cached (12 h, per video and study context).
  - After an error or 15 s, the video groups' answer stands, and is labeled as such.
- **The Siren Gate:**
  - It lives in a closed shadow DOM with no `innerHTML`, which is safe under YouTube's Trusted Types.
  - "Close" answers count as right. A leisure pass opens the whole site.
  - The transcript excerpt is always `null`, because YouTube's caption URLs are signed.
- **Dev pages:** `dist/dev/gate.html?scenario=gemini|heuristic|shorts|few-cards|blocklist|cleared`, plus `dist/dev/popup.html` and `dist/dev/options.html`. Serve `dist/` over http to view them.

### Next ideas (after the "Next steps" above)
- Decide on Paper (the art app) imports.
- **Audio:** the spec's asset folders include "audio ambiance". The sea sound is synthesized today. Recorded ambience could replace it, but sound must stay off by default.
- Possible additions: install as an app (PWA), cross-device sync, a weekly "voyage report", and recording your own sessions as ghosts for friends.

## Decisions made in session 4

### Sprite contracts (`shared-types/sprite.ts`, `ship-theme-kit/sprites.ts`)

**Where the art lives**
- Art lives in `apps/web/public/assets/`, one folder per sheet, each with its own `manifest.json` (a `SpriteManifest`).
- Folders (`SPRITE_FOLDERS`): `ships/<shipId>`, `sails`, `figureheads`, `flags`, `props`, `avatars` and `environment/<envId>`.
- `index.json` lists the folders that have art. The app reads it first, and fetches nothing else while it's empty. `npm run assets -w @ship/web` writes it.

**Coordinates:** at density 1, one image pixel is one scene unit. That means ship units on deck, station units for sailors and room units in the quarters. `"density": 2` marks double-size art.

**Sizes** (exact, and checked):

| Sprite | Size | Anchor |
|---|---|---|
| hull layers | 1000×300 | (500, 150): the deck line at the ship's middle |
| rigging | 1200×700 | (600, 700) |
| sails | 320×320 | the top yard; the engine fits each set to its mast's canvas from `rigFor` |
| figureheads | 160×160 | the mount, (24, 96), facing right |
| flags | 120×72 | the hoist's top corner; drawn flat |
| avatar layers, desks, galley table | 256×256, the station frame | (128, 246): the floor under the desk |
| cabin-room | 1000×640 | |
| environment sky | 1920×1080 | |
| clouds, wave bands | 2048×512 | waves sit on their crest row |

**Where per-ship offsets live (a deviation from the spec)**
- Each ship's offsets are in its own `manifest.json`, next to the art: `layout` overrides on top of the built-in `HullLayout`, and `placements`. The spec put them in the theme kit.
- The theme kit holds:
  - what every sheet must contain (`spriteSheetSpecs()`);
  - the checks (`validateManifest`, which also checks the shape of every `layout` key, and `sheetProgress`);
  - the sailor's layer lookup (`avatarSpriteSlots`, `missingAvatarSprites`).

**Rigging is its own sprite.** The spec only sizes hulls. Masts reach −560, which a 300-tall hull can't hold, so the masts, yards, crow's nest and flag pole are a separate 1200×700 sprite. Anything more than about 30 units below the waterline is hidden by the front waves, so 300 is tall enough for the hull itself.

**Ship stacking** (`SHIP_Z`): hull-back 10, rigging 20, sails 30, deck details 40, props and sailors 50, hull-front 60, figurehead 70, flag 80. On a tie, the manifest's sprites go first.

**Sailor layers**, bottom to top (`AVATAR_LAYER_ORDER`): hair-back, body, coat, [desk], tool, head, eyes, mouth, hair-front, hat, accessory, arms, hands.
- Arms come last so a cup or spyglass covers the face, and folded arms cover a sleeping head.
- **Arm poses:** writing, typing, relaxed, sipping, stretching, spyglass and resting.
- **Eyes:** open, focus, blink, happy and sleep.
- **Mouths:** smile, flat, open, sip and sleep.
- The procedural pose has more faces; they map onto these (squeeze and wink become happy, yawn becomes open, and so on).

**Tinting**
- Skin, hair, coats and sleeves are drawn in greys and marked `tintable`. The engine colors them with "hard-light" over the chosen color, so `#808080` becomes the color itself.
- A variant id wins over tinting when it exists: `body:<skin>`, `head:<skin>`, `arms:<pose>:<coat>` or `hands:<pose>:<skin>`.

### Compositor (`apps/web/src/ship-engine/sprites/`)

**Loading** (`store.ts`) is lazy:
- `index.json` is read once, by `sprites.start()` in ShipCanvas.
- A sheet's manifest and images load the first time something asks for that sheet.
- A sheet appears only when all of its images are in.
- Sprites that fail validation are dropped with a console warning. A folder is fetched once, even if it fails.
- `sprites.version` goes up as each sheet arrives. That clears `shipLayout`'s cache and the cache of which sailors are ready.
- The galleries call `preloadAll()`.

**The switch-over happens per part**, at the existing drawing entry points: `drawShip`, `drawSails`, `drawFigurehead`, `drawFlag`, `drawHelm`, `drawCitrusTree`, `drawBell`, `drawDesk`, `drawGalleyTableBody`, `drawCabinDecor`, `drawSky`, `drawClouds`, `drawSeaBack`/`drawSeaFront`, the quarters' room and `AvatarRenderer`. A part switches when its set is complete:
- **A ship:** once `hull-back`, `rigging` and `hull-front` are all in. Its manifest `layout` then applies too. On a sprite ship, bare masts get no procedural yards.
- **A sail style:** once both looks are in. Sails are furled while the wind is under 0.45 (docked) and billow above it (shore leave and sailing).
- **The citrus tree:** once all three looks, the fruit and the blossom are in. The engine hangs one fruit sprite per ripe fruit.
- **The helm:** once the stand and the wheel are in; the wheel turns. The bell swings around its anchor.
- **The sea:** once all three wave bands are in. They ride the procedural wave layers' heights, so the ship's bobbing still matches the water.
- **A sailor:** only when `missingAvatarSprites` is empty for their loadout, so no sailor is half sprite and half procedural. Desks switch on their own.

**The engine's own effects stay procedural:** the flag's wave (drawn in strips), the sails' breathing, Zzz, stretch lines, name tags, particles, the bell's sound lines, lantern glow and the night tint.

**Build output:** Vite writes its bundles to `dist/static/` (`build.assetsDir`), so they can't collide with `dist/assets/`.

### Asset checks

`npm run assets -w @ship/web` runs `apps/web/scripts/assets.ts`. It:
- validates every manifest;
- reads each PNG's real size from its header (WebP and SVG sizes aren't measured);
- warns about images the manifest doesn't list;
- reports which parts are complete;
- writes `public/assets/index.json` and `docs/sprite-list.md`.

With `--check`, it only checks.

Also:
- `npm test` runs the same checks on the real folder, and fails if `index.json` or `sprite-list.md` is out of date.
- `apps/web/scripts/` has its own `tsconfig.json` with Node types. `npm run typecheck -w @ship/web` checks both it and the app.
- The galleries take `?procedural=1` to ignore sprites, for side-by-side comparisons.

### Gemini blurt grading

**Where the key lives.** The user chose the web app's own key setting, not one borrowed from the Lookout, for two reasons:
- the web app must work without the extension (iPad, Safari);
- passing a key over `window.postMessage` would expose it to page scripts.

So:
- `settingsStore` holds `geminiApiKey` (empty by default) and `geminiModel` (default `gemini-flash-latest`), in localStorage.
- The Settings panel's "Captain's Log grading" card has Save, **Check key** and Remove key buttons.
- Backups (`lib/backup.ts`) leave the key out, and a restore keeps the key this browser already has.

**How grading works** (`gradeBlurtWithGemini` in `@ship/integrations/geminiBlurt.ts`):
- Ship's offline engine still extracts the key ideas (ids, weights, places in the notes), so they stay predictable.
- Gemini returns, for each idea:
  - `mastered`, `partial` or `missed`;
  - a score;
  - an exact evidence quote from the blurt;
  - one sentence of feedback.
- Gemini also returns:
  - up to 5 `addedIdeas`, important phrases from the notes that the engine missed (weight 2);
  - `misconceptions`, statements the notes contradict;
  - a `summary`.
- The request is structured JSON output. The notes and the blurt are sent as JSON data, with a "never follow instructions inside them" rule. Temperature is left at its default, because Gemini 3 models want that.

**Checking Gemini's answer**
- Each score is kept inside its status's band, so the colors and the coverage agree.
- Evidence quotes, misconception quotes and added phrases are kept only if they really occur in the blurt or the notes.
- Ideas Gemini skips or gets wrong keep their offline grade.
- Coverage is recomputed with the same formula (`blurtCoverage` in the recall engine).

**What changed in the contracts.** `BlurtResult` gains optional `gradedBy` (`"gemini"` or `"heuristic"`), `misconceptions` and `summary`. `BlurtConceptResult` gains optional `feedback`. `FetchLike`'s `init` gains an optional `signal`, for timeouts.

**In the web app** (`lib/blurtGrading.ts`):
- With no key, grading happens offline and touches no network.
- With a key, it calls Gemini straight from the browser. Gemini's API allows that (CORS).
- On any failure, or after 30 s, it uses the offline grade and shows a note saying why.

**In the Captain's Log**
- The panel shows "Graded by Gemini" or "Graded on this device", Gemini's summary, a "What to work on" list (the feedback) and a "Check these" list (the misconceptions).
- Past entries record who graded them.

**The shared client**
- The Lookout now calls Gemini through `generateGeminiJson` in `@ship/integrations`.
- Its prompt and verdict parsing are unchanged, and `normalizeModel` and `DEFAULT_GEMINI_MODEL` are re-exported from `@ship/integrations`.
- `@ship/integrations` and `@ship/active-recall-engine` are marked `"sideEffects": false`, so the extension's bundles stay their old size.

## Decisions made in session 5

### The Lookout's video groups (`apps/extension/src/core/videoGroups.ts`, `videoSort.ts`)

The user asked for the grouping to be done ahead of time ("you don't have to use Gemini on the spot"). So the Lookout carries its own knowledge and sorts most videos instantly, with no network. Gemini became an optional second opinion.

**The groups**
- **Subjects:** 17 subjects (math, statistics, physics, chemistry, biology, medicine, earth and space, computer science, engineering, history, government, economics, English, psychology, philosophy, arts, geography) plus 12 languages. Each has:
  - telltale terms: "krebs cycle" means biology, "stoichiometry" means chemistry;
  - course codes: "BIO 201", "CS61B", "APUSH", "AP Calc";
  - related subjects (math ↔ physics, for example).
- **Kinds of video:**
  - lessons: "lecture", "tutorial", "explained", "practice problems", "… in 5 minutes";
  - study audio: lofi, rain sounds, "study with me", "10 hours of …";
  - 11 distraction groups: gaming, reactions, comedy and challenges, vlogs and lifestyle, music videos, TV and film, sports, shopping, celebrity news, cooking, and clips and streams.
- **166 known channels:** lesson channels with their subjects, "edutainment" channels (fun explainers such as Veritasium), and entertainment channels.
- **YouTube's own category:** read from `meta[itemprop="genre"]`, only when the page's meta tags describe this video. Education and Science & Technology lean lesson. Gaming, Music, Comedy and the like lean distraction. People & Blogs is the upload default, so it means nothing.

**Avoiding false alarms.** Words that would misfire on study videos are left out or narrowed: "reaction" (chemistry), "makeup" (a makeup exam), "edit" (editing an essay), "goals", "season", "matrix", "galaxy", bare "episode" and "comedy". Short course codes ("art", "me") count only as the course's first word or right before a number.

**How a video is sorted** (`sortVideo`). The verdict always has `source: "heuristic"`, and a reason that names the group. The rules, in order:
1. An entertainment channel is blocked, unless the title names the topic twice.
2. Study audio is allowed.
3. A distraction is blocked, unless the title is strongly on topic and there's only one distraction group. If it touches the topic at all, the block is marked unsure.
4. With a study context:
   - a strongly on-topic title is allowed;
   - an edutainment channel is allowed only when on topic (and unsure); otherwise it's blocked;
   - a lesson in the studied subject is allowed;
   - a title naming the studied subject is allowed;
   - a video clearly from another subject is blocked ("This is a chemistry video, but you're studying history.");
   - a lesson from a related subject is allowed but unsure;
   - otherwise the old keyword relevance decides, unsure.
5. With no study context, lessons are allowed and everything else is blocked.

**Who decides**
- A verdict is **sure** at confidence 0.75 or more (`SURE_CONFIDENCE`).
- `lookout.ts` uses a sure verdict straight away, even with a Gemini key.
- An unsure verdict goes to Gemini only when a key is set (cached as before). If Gemini fails, the groups' answer stands, prefixed "Gemini couldn't answer, so the Lookout's video groups decided."
- The groups' verdicts aren't cached; they're instant.

**What changed in the contracts:** `VideoInspection` gains optional `category`. `LookoutVerdict.source` keeps `"heuristic"`, now documented as the video groups. The old keyword check (`heuristic.ts`) is gone; `topicKeywords` lives in `videoSort.ts`.

**Wording:** the labels and the options, popup and Lookout panel texts say "video groups" instead of "keyword check", and call Gemini a second opinion.

## The public website (2026-11-02)

Ship is published at https://silverninja71.github.io/Ship/.

**How it publishes**
- `.github/workflows/deploy-pages.yml` runs on every push to `main`: typecheck, test, `npm run build:site`, then a force-push of the built files to the `gh-pages` branch.
- GitHub Pages must be set to **Deploy from a branch → `gh-pages` / root** (Settings → Pages). Set to `main`, it shows the README as a web page instead of the app.
- `gh-pages` holds only generated files and its history is replaced on each publish, so never work on it by hand.
- `base: "./"` in `vite.config.ts` makes every file path relative, so the build runs from `/Ship/`.

**What's different on the website** (`apps/web/src/lib/hosting.ts`; `isHostedSite` is true unless the host is localhost, 127.0.0.1 or [::1])
- **Crew rooms:** Join stays off, with a note, until Settings has a crew server address other than this computer. The site never contacts `localhost` by itself, because browsers may show visitors a permission prompt for that.
- **Canvas:** the form is replaced by a note. The relay refuses every page outside localhost on purpose, because it carries login tokens; don't open it up without a real design for that.
- **Todoist and calendar feeds:** browser requests only, with no relay fallback.
- **The Lookout panel:** offers `lookout.zip`, which leaves out the extension's dev pages.

**Testing website behavior locally:** serve the build inside a `Ship/` folder and open `http://ship.localhost:<port>/Ship/`. That hostname reaches this computer but counts as hosted.

**The Lookout**
- `DEFAULT_SHIP_URL` is now the website. Anyone running locally sets `http://localhost:5173` on the options page, or steering back opens the website.
- The manifest has a host permission for `silverninja71.github.io`. The bridge for that site is registered at run time (`customShipBridgePattern`) and only covers `/Ship/*`.
  - **Changed by the redesign:** the manifest now also lists the bridge for all of `silverninja71.github.io/*` and for both Firebase addresses, so the bridge script is injected on every page of those hosts. It still does nothing unless the page has `<meta name="ship-app">`, so other sites on the shared host are unaffected in practice.
- `isShipTabUrl` checks the path too, so a game tab on the same host doesn't count as Ship.

**One shared address:** every GitHub Pages site of this account lives on `silverninja71.github.io`, so they all share one localStorage. Ship's keys all start with `ship:`, and "Start over" only removes those. No game under `~/Downloads/mace-split` called `localStorage.clear()` when checked on 2026-11-02. But any page on that address can read Ship's saved Gemini, Todoist and Drive tokens. A custom domain would separate them. So does the Firebase address added by the redesign, which has a storage area of its own (see "Two web addresses" under "The kawaii redesign").

**Verified:** all tests; the published build at `ship.localhost` and, on 2026-11-02, on the live site: file loading from `/Ship/`, the scene (screenshot), the crew, Fleet Log, Lookout and Settings panels, the zip link, starting a voyage and surviving a reload, with no console errors; and one real run of the workflow.

**Not verified:** the real extension against the real website, Todoist or Drive from the website, and phones.

**To make crew rooms work on the website:** host `apps/signaling-server` somewhere with a `wss://` address, then make that the default `crewServer` on the website.

## Uploading coursework (2026-11-03)

The Fleet Log's Import files tab takes PDF, Word (`.docx`) and PowerPoint (`.pptx`) files, images, and pasted links. They become notes with `source: "file"`, which the Captain's Log can blurt against. PDF, Word and PowerPoint are read in the browser. Images and links go to Gemini.

**The readers** (`packages/integrations/src/documents/`)
- `pdf.ts` uses pdf.js's legacy build, loaded only when someone imports a PDF. pdf.js gives back positioned scraps, so this rebuilds lines and sentences, turns big text into `# headings`, and removes page numbers and repeated headers and footers. Those would otherwise look like key ideas, because the blurt check scores words by how often they recur. Bullets in symbol fonts (Unicode's private area) become `•`.
- `docx.ts` and `pptx.ts` read the zip's XML with `officeZip.ts` (fflate) and the small scanner in `xml.ts`. Headings, bold and lists come through as `#`, `**` and `- `, which the blurt check counts as key ideas. A two-column table row becomes `Term - definition`. PowerPoint includes speaker notes and SmartArt text.
- `.doc`, `.ppt`, `.pages`, `.key`, `.odt`, `.odp` and `.rtf` get a message saying what to save them as. So do Office's `~$` lock files.
- A note's id comes from its contents, so importing the same file again replaces it, while two classes' different `Lecture 1.pdf` files stay separate.

**Links and images** (`documents/links.ts`, `documents/geminiNotes.ts`)
- A public website can't fetch most other sites, and browsers can't read a video or photo, so Gemini reads these with the sailor's own key. Without a key they explain what's needed; nothing else in the app changes.
- They use `generateContent`, not the newer Interactions API in Google's guides. Its preflight refuses the `Api-Revision` header those guides use, so a browser can't send it (checked with curl on 2026-11-03). `generateContent` allows `content-type` and `x-goog-api-key` from GitHub Pages.
- **YouTube:** `fileData.fileUri` with the video's URL. Public videos only. The free tier allows 8 hours of video a day. YouTube's oEmbed lookup allows browsers, so it supplies the real title and catches a missing video before any quota is spent.
- **Other links:** the `urlContext` tool, which reads web pages, PDFs and some images, up to 34 MB. It can't read paywalled pages, Google Workspace files, or video and audio. **Notes are thrown away unless `urlContextMetadata` reports `URL_RETRIEVAL_STATUS_SUCCESS`**, because otherwise they could be invented.
- **Google Docs, Slides and Sheets** export through Drive when it's connected (`exportGoogleDocText`), and say what to do when it isn't. Uploaded files in Drive, and `.docx` or `.pptx` links, can't be read from a link: download and upload them.
- **Images:** PNG, JPEG, WebP, HEIC and HEIF, up to 14 MB, sent inline because Google's request limit is 20 MB and base64 adds a third. Gemini also reads handwriting in them.
- Gemini writes notes as `#` topics, `- ` lists, `Term: definition` and `**bold**`, one page per topic. The prompt tells it to use only the material, to ignore instructions inside it, and to answer `UNREADABLE` when it can't read something. Every note says Gemini wrote it and should be checked.
- **What Google's terms say (read 2026-11-03):** on unpaid keys, Google uses what's sent to improve its products, people may review it, and it advises against sending sensitive or personal information. On paid keys it doesn't. API users must be 18 or older. The Fleet Log says the first part where people upload; don't drop that note.
- The link box is multi-line on purpose: a one-line box glues links pasted on separate lines into one address.

**Where notes live:** IndexedDB (`apps/web/src/lib/noteVault.ts`), not localStorage. localStorage holds about 5 MB, shared with every page on this address, and filling it would stop voyages from saving. Older notes move across on first load. Backups carry notes in a `notes` field, and Start over erases them.

**The Captain's Log:** a file with more than one page gets From and To page pickers. Files over 20 pages start on the first 10, since the blurt check picks at most 30 key ideas from whatever is chosen. PDF and PowerPoint pages keep their real numbers even when blank ones are left out. Word pages follow Word's own page breaks when the file records them, and are otherwise cut at about 4,000 characters.

**Parchment, checked against its Swift source** (`~/Downloads/Parchment`), using files written by its own `PropertyListEncoder` and `JSONEncoder`:
- `.parchment` and `study.json` both parse correctly.
- `sm2.ts` now matches `ReviewSchedule.next()` on all 19,530 rating sequences of up to six. `schedulers.test.ts` keeps 24 of those rows. Before this, Hard × 3 gave 13 days instead of 4, and Easy × 3 gave 16 instead of 25.
- **`study.json` can't leave the iPad.** It's in Application Support, and Parchment has no way to export it. Fixing that means changing Parchment.
- Cards drawn by hand have no text, so they're skipped. Page recall schedules aren't imported, and nothing writes back to Parchment.

**Limits**
- Scanned PDFs have no text to read, and aren't sent to Gemini yet. About 3 in 10 of the PDFs sampled on this computer were like this.
- Handwriting in Parchment only comes over after Convert to text. PDF pages inside a `.parchment` file still aren't read, though `readPdf` could now do it.
- Google Drive still doesn't read PDF or `.parchment` files.
- CJK PDFs relying on Adobe's predefined character maps may come out empty, because the map files aren't shipped. Word footnotes aren't read.
- Cards still aren't generated from notes directly, only from what a blurt missed.

**Verified:** all tests, including real PDFs read by pdf.js in Node. Real files on this computer through the readers, recording only counts: all 64 Word files and 25 PowerPoint files that weren't lock files gave text, 48 of 70 PDFs did, and the other 22 had no text at all on their first page, only images. Nothing garbled. In the built-in pane at `ship.localhost/Ship/`: uploading PDF, Word and PowerPoint files, the worker loading from `/Ship/static/`, a broken PDF and a scanned page being explained, notes surviving a reload, page ranges, blurting, making cards, removing a note, Start over, and no console errors. GitHub Pages serves `.mjs` as `text/javascript`, checked on Mozilla's pdf.js site there.

**Links and images verified:** tests with Gemini faked, and in the built-in pane at `ship.localhost/Ship/` with Gemini's replies faked inside the page: pasting several links, a real YouTube title lookup, the key in a header and never a URL, a page Gemini couldn't open being refused even with notes attached, an image upload, no-key messages, notes surviving a reload, blurting on them, and Start over. A real request reached Gemini from the browser (403 with no key sent).

**Not verified:** **anything with a real Gemini key, including whether real video, link and image requests work**; real Google Docs links through Drive; uploads on the live site (not published yet); iPad or iPhone Safari, including HEIC photos; a real Word or PowerPoint file in the browser rather than in Node; real Gemini grading of uploads; and restoring a backup with notes through the Settings panel.

## The kawaii redesign (2026-11-16 to 2026-11-18)

Thirteen commits pushed straight to `main` restyled the whole app and added a planner, sign-in and a second web address. Nothing here was planned in this file; it was written afterwards from the code (see "Status").

The redesign left three documents of its own in `docs/`:
- `ARCHITECTURE.md` and `THIRD_PARTY_NOTICES.md`: its short summaries. Where they disagree with this section, check the code.
- `FUTURE_DRAFTS.md`: a wish list of more characters, costumes and themes. **None of it is built.**

### New names

| On screen | In the code | What it is |
|---|---|---|
| Pwedo Pomo | `voyageStore`, `VoyageDock.tsx` | the focus timer (a "voyage") |
| Banana Planna | `plannerStore`, `PlannerPanel.tsx`, panel id `planner` | the planner (new) |
| Study Sheets | `CaptainsLogPanel.tsx`, panel id `log` | the Captain's Log |
| Ink & Paper | `visualStyle: "tiny-ink"` | the default look (new) |
| Full Color (Storybook) | `visualStyle: "storybook"` | the look from sessions 3–5 |

**The characters** stand on the deck in both looks. The code calls them "minions" (`ship-engine/minions.ts`, `components/PastelMinionBadge.tsx`):
- **Captain Banan**: at the helm, in a captain's cap.
- **Pip**: a yellow helper with one eye, a banana stem and blue overalls.
- **Mochi**: in a teddy costume.
- **Lumi**: in a bunny costume.
- **Pwedo**: a small white pigeon. The timer is named after it.

A frog costume also exists, for badges only.

### The two looks

Settings → Appearance → Visual style switches between them (`settingsStore.visualStyle`). `App.tsx` copies the choice onto `<html data-visual-style>`, and `index.css` sets the page colors for each.

**Ink & Paper** (`ship-engine/tinyInk.ts`) is the default:
- The ship, sea and sky are recolored to cream, tan and grey (`toTinyInkShip`, `toTinyInkEnv`). Outlines turn soft grey and slightly wobbly (`setHandDrawnMode` in `draw.ts`), and a paper grain covers the canvas. Only the characters carry color.
- **Not drawn on the deck:** the citrus trees, the bell and your own sailor. So:
  - ripe fruit can't be picked in this look (it still ripens, and it's still saved);
  - nothing you choose in the Wardrobe shows anywhere.
- The helm, the desk, the flag and the figurehead are still clickable, and crew tables still appear.
- In the quarters, Captain Banan sits at a cream desk where your sailor was, and the ship's decor item is gone.
- Clicking a character shows its one-line bio.

**Full Color** keeps everything from sessions 3–5, with the characters added to the deck and quarters. Its page background is navy.

**Which scene the canvas shows** (`ShipCanvas.tsx`, deck view), first match wins:
1. Docked with the Pwedo Pomo options open: Pwedo hopping about (`renderPwedoPlayScene`), in both looks.
2. Ink & Paper while focusing: a study desk with no ship (`renderStudyDeskScene`).
3. Ink & Paper on a break: a picnic, a swim and a sing-along (`renderBreakScene`).
4. Anything else: the deck. During the one-minute prep the characters sweep and mop. A paused timer shows the deck too.

Scenes 1–3 are in `StudySceneRenderer.ts` and have nothing to click.

**Sprites:** the compositor wasn't touched, and no art has arrived. Sprites are images, so Ink & Paper's recoloring wouldn't change them; nobody has looked at the two together.

**The Shipwright** previews each ship in a pastel palette of its own in Ink & Paper (`ships/tinyInkShip.ts`). Those palettes are used only for the previews; the deck uses the cream-and-grey one.

**Colors and fonts:** `index.css` now writes Ship's palette in OKLCH (a way of writing colors that keeps brightness even between hues) and uses the device's own serif fonts, so no font is downloaded. Many new components hard-code hex colors instead of using those tokens.

### Pwedo Pomo (the timer)

The pill at the bottom of the scene is `VoyageDock.tsx`. Opening it offers:
- 25/5, 50/10, Custom (1–240 minutes of focus, 0–60 of break), and "50/40/30 Tiny Method", which sets 50 minutes of focus, a 10-minute break and 3 cycles, whatever its label suggests;
- the number of cycles (`settingsStore.pomodoroCycles`, default 2; the store keeps it between 1 and 8);
- an objective, and a sound picker.

What changed in `voyageStore`:
- **Cycles:** a cycle is one focus block and its break. When a break ends, the next focus block starts by itself, until `cyclesCompleted` reaches `cyclesTotal`; then the ship docks. Each finished focus block is its own `VoyageRecord`, pays the +25 bonus and ripens fruit.
- **Prep:** starting from the pill sets `prepEndsAt` one minute ahead ("Preparing in 0:59", with Start now and Cancel). Nothing is paid and the Lookout doesn't guard until the focus block begins.
- **The Space bar skips both:** it starts one cycle with no prep (`toggleVoyage` in `useKeyboard.ts`).
- **Break reflection:** when a focus block ends and a break begins, `BreakReflectModal` asks how the session went, what worked and what to change. Answers go to `breakReflections` (the latest 100). It can be dismissed.
- **Session tasks:** a small to-do list inside the running pill (`sessionTasks`). Tasks stay until removed.
- All of these are saved under `ship:voyage`.

The pay rules, the timestamp-based timing and the idle pause are unchanged.

### The page below the scene

Ship used to be one screen. Now the scene fills the first screen and the page scrolls on (`App.tsx`). The scene's height is `100dvh`, which keeps the pill in view when a phone's address bar appears.

`StudyMaterialsSection.tsx` holds, in order:
1. **Pomodoro Tracker:** two session cards, each with 5 tasks, 4 focus boxes, 4 break boxes and a "how can I improve next session" note. The boxes tick themselves as Pwedo Pomo cycles finish.
2. **Active Recall Study Sheets:** an upload button and a drop area (the Fleet Log's importer, `fleetStore.importFiles`), shortcuts to Study Sheets and Flashcards, and a list of up to 6 notes.
3. **Weekly Plan and Habit Tracker** (`BananaPlannaSection.tsx`): 4 lines per day and 6 habits.

A footer with the legal links comes last.

**The top bar** (`Hud.tsx`) has Banana Planna, Study Sheets, Flashcards (with the number due), the Lookout's status, the Desk/Ship switch, Log in, `?` (the tutorial) and Settings. The doubloon count is no longer there; the Shipwright and the Wardrobe show it.

**The other panels have no button:**

| Panel | Key | By clicking |
|---|---|---|
| Helm | `H` | the helm |
| Shipwright | `S` | the flag or the figurehead |
| Fleet Log | `G` | a button inside the Helm panel |
| Wardrobe | `W` | your sailor, who is only drawn in Full Color |
| Crew | `C` | a crewmate, so only once you're already in a room |
| Banana Planna | `P` (new) | its top-bar button |

So without a keyboard (a phone or tablet), nobody can open Crew to join a first room, in either look, and the Wardrobe can't be opened in Ink & Paper.

**First visit:** a four-step tutorial (`OnboardingModal.tsx`, reopened with `?`) and a storage notice (`ConsentBanner.tsx`).

### Banana Planna (the planner)

`stores/plannerStore.ts`, saved under `ship:planner`. The panel (`PlannerPanel.tsx`) has five tabs:
- **Weekly Plan:** a title, a goal and a grid of 10 rows by 7 days.
  - It empties itself when a new week starts, at Sunday 12:00 am local time. `checkAndResetWeek` runs when the saved data loads and every minute while the page is open.
  - Only the title, the goal and the grid are emptied. **Habit ticks never reset**, though the tracker is laid out as one week.
- **Habit Tracker:** 8 habits, each with 7 daily ticks. Four come with names.
- **Pwedo Pomo:** the Pomodoro Tracker cards described above.
- **Banana Planna:** a month title, 35 day boxes and notes. The boxes aren't tied to real dates.
- **Obsidian & Report** (`lib/plannerExport.ts`):
  - writes the planner as `Ship-Planner.md` into a folder you pick (the browser asks first; Chrome and Edge only), or downloads it;
  - builds a plain-text monthly report to download, or to open in your mail app through a `mailto:` link. Ship itself sends no email.

**Daily check-in:** a button in the panel pays 5 doubloons and 20 XP once a day. The day is counted in UTC (`todayDateKey`), so it rolls over at a different hour than local midnight.

**Monthly stats** (`MonthlyStatsModal.tsx`): four slides (focus time, sessions and cycles, top hashtags, habit streaks).
- It opens by itself on the last day of a month, and on the first visit after a month ends. The Monthly Stats button opens it any time.
- Its hashtags are counted from voyage objectives, the Weekly Plan and Pomodoro tasks. They are **not** the tags from Study Sheets.

### Study Sheets (the Captain's Log)

- **Hashtags:** a blurt can carry tags such as `#bio101` (`BlurtSession.hashtags`, optional). `lib/captainsLogService.ts` cleans them up and suggests ones used before. Nothing filters or searches by tag yet.
- Files can be dropped straight into the panel.
- `captainsLogService.ts` also holds the page-range constants and `buildNoteSources`, moved out of the panel.

### Sound

- Still fully synthesized with WebAudio, with no audio files, and **still off by default** (`settingsStore.soundOn` starts `false`). The rule under "The user" holds.
- `lib/audio.ts` now has six synth profiles: ocean, rain, ASMR, lo-fi, piano and starlight. `CURATED_FOCUS_TRACKS` lists 11 named tracks, and each plays one of those six. So "Matcha Morning Study" and "Lo-fi" sound the same.
- Picking a track in the pill or in `AudioBrowserModal.tsx` turns sound on. That counts as the user's click.
- `settingsStore.soundTrack` remembers ocean, lo-fi, ASMR or rain (default rain). A piano or starlight choice lasts until the page reloads.
- **It pauses for other audio** (`hooks/useAmbiance.ts`): when the system's media keys say pause, when the browser interrupts the audio, when an `<audio>` or `<video>` starts on the page, and when the page is closed. Pausing switches `soundOn` off, so it doesn't restart by itself.

### Accounts and privacy

**Google sign-in** (`lib/firebase.ts`) uses Firebase Authentication, Google's sign-in service, with the project `ship-pwedo-pomo`.
- **Signing in turns on cloud sync** (since 2026-11-21; see "Cloud sync"). It also shows your first name in the top bar, with the sync mark, and saves your name and email in this browser.
- The Sign in button stays off until a box is ticked: 13 or older (or with permission), and agreeing to the Privacy Policy and Terms.
- The same window still has the Google Drive client ID box. Drive is a separate connection, for importing Google Docs; it doesn't sync progress.
- The values in `firebaseConfig` are not secrets. Every Firebase web app publishes them; what protects the project is its list of authorized domains in the Firebase console. Don't "fix" this by hiding them.
- After someone's first edit to the planner, cards or notes, a small prompt suggests logging in to keep a copy in their account. It appears until dismissed, and never once they're signed in.

**The storage notice** (`ConsentBanner.tsx`) offers "Essential only" and "Accept", and saves the answer as `ship:storage-consent`. **Nothing reads that answer**: Ship has no analytics or ads to switch off, so both choices behave the same.

**The legal window** (`LegalModal.tsx`) has four tabs: Privacy Policy, Terms of Service, Cookies & Storage, and Free Tier & Contact. Its text names the project's operator and makes promises about data, so read it before changing how data is handled.

**Delete everything** (`deleteAllUserData` in `lib/accountData.ts`): deletes the account's cloud copy, then the Firebase account, removes every `ship:` key and empties the notes. If the cloud copy can't be deleted, nothing is deleted and the window says why. If Firebase refuses to delete the account because the sign-in is too old, it signs out instead and still clears the cloud copy and this browser. Settings → Start over is the local-only version: signed in, it signs out first, because the cloud copy would otherwise come straight back.

**New saved keys** (`lib/accountData.ts`): `ship:profile-name`, `ship:profile-email`, `ship:tutorial-seen`, `ship:signin-prompt-dismissed` and `ship:storage-consent`. These hold plain text, where every older `ship:` key holds JSON.

**Backups** (`lib/backup.ts`) pick up every `ship:` key, so they carry the planner too. Plain-text keys (name, email, consent) go into a separate `text` section and come back word for word. Until 2026-11-21 they were read as JSON, saved as `null` and restored as the word "null"; restores now skip those `null`s in older backups. `ship:sync-meta` is never backed up.

### Two web addresses

Ship is now published twice, from the same build:

| | GitHub Pages | Firebase Hosting |
|---|---|---|
| Address | https://silverninja71.github.io/Ship/ | https://ship-pwedo-pomo.web.app (also `ship-pwedo-pomo.firebaseapp.com`) |
| Published by | the workflow, on every push to `main` | by hand, with the Firebase command-line tool (no workflow does it) |
| Settings | `.github/workflows/deploy-pages.yml` | `firebase.json`, `.firebaserc` |

- On 2026-11-20 both served the same bundle as a fresh build of `main`.
- **Firebase can fall behind.** Nothing publishes it automatically, so a merge updates GitHub Pages only. The usual way is `npm run build:site`, then `firebase deploy --only hosting`; that wasn't run in this session.
- **Each address keeps its own saved data.** Browsers store data per address, so progress on one doesn't appear on the other.
- `isHostedSite` is true on both, so crew rooms and Canvas behave as "The public website" describes.
- **The Lookout:** the bridge is listed for both addresses, but `DEFAULT_SHIP_URL` is still the GitHub Pages one. Steering back opens that address unless the options page is changed.
- `.firebase/hosting.*.cache` is committed. It's a scratch file the Firebase tool rewrites on every deploy, and it belongs in `.gitignore`.

### Auto-sync

`hooks/useAutoSync.ts` calls `fleetStore.syncAll()` when the app opens, every 15 minutes, and when the tab is shown again, at most once every 2 minutes. It does nothing unless a calendar feed, Todoist, Canvas or Drive is set up. The older rules still apply: Canvas is skipped on the website.

The redesign also made `useLookoutBridge` say `hello` again before each voyage update and reward claim, whenever the Lookout isn't marked connected. That gives an extension that wasn't answering at page load another chance to connect.

### The Lookout's gate

The Siren Gate's art and wording changed to match (`apps/extension/src/gate/`): "Lookout Minion spotted a distraction" and "Hey! Stay focused!". Its rules didn't change.

### Open questions for the user

1. **Pip.** A yellow, one-eyed character with a goggle and blue overalls, dressed as a banana and called a "minion" in the code and in `FUTURE_DRAFTS.md`, is very close to the Minions from the *Despicable Me* films (Illumination/Universal). This file's rule for ships is "original, same vibe, safe to share" (see "Ships"). Pip may need the same treatment before Ship is shared widely.
2. **"Mr. Tiny Studio".** The code comments and one Settings label ("Ink & Paper (Mr. Tiny)") name the studio whose style the look follows. Taking a style as inspiration is one thing; showing another studio's name in the app is another. Consider dropping the name from the label.
3. **Sprites or drawn-in-code?** See the note at the top of "Next steps".
4. **Which address is the real one?** That decides the Lookout's default and whether GitHub Pages stays.

### Gaps found while reading the code

Not fixed; listed so nobody rediscovers them:
- **A 0-minute break stops the cycles.** With Custom and a break of 0, the ship docks after the first focus block and the remaining cycles never start.
- **Scrolling on a touchscreen.** The canvas still has `touch-action: none` from when the app was one screen. A swipe that starts on the scene may not scroll the page; the pill's "Scroll for study sheets" link does. Not checked on a real phone.
- **The phone top bar** wraps onto two rows at 390 px wide, and Flashcards and Desk lose their text labels.
- **The planner export** writes each habit as "n/31 days", though a habit has 7 ticks.
- The gaps already named above: fruit can't be picked in Ink & Paper, the Wardrobe and Crew panels can't be opened without a keyboard, habit ticks never reset, and the daily check-in counts days in UTC.

### Verified, and not

**Verified on 2026-11-20** in a cloud session: typecheck, all 857 tests and `npm run build:site`; the built site opened in headless Chromium at desktop and phone sizes (the tutorial and the storage notice appear, with no console errors); and both public addresses answer with the current bundle.

**Not verified:**
- Real Google sign-in on either address, including whether GitHub Pages is among the Firebase project's authorized domains.
- Deleting an account for real.
- A full multi-cycle run with breaks and reflections, in a browser.
- The Sunday reset and the month-end popup, at the real times.
- Whether sound really pauses when another app plays, on any device.
- The Obsidian folder write.
- The Lookout against the Firebase address.
- A phone or tablet.

## Cloud sync (2026-11-21)

Logging in with Google keeps a copy of the sailor's progress in their Google account, in Firestore (Firebase's database), and keeps every device they log in on in step. The user chose this over only fixing the "sync" wording.

**It needs a Firestore database and these rules in the real project before it works** (see "Switching it on"). Until then, signed-in sailors see "The cloud refused to save your progress…", and everything keeps working in their browser.

**What syncs** is an allowlist, `SYNCED_FIELDS` in `lib/syncPlan.ts`. A new field stays on the device until someone adds it there on purpose.
- The planner (all of it).
- From the voyage store: records, the citrus tree, break reflections and session tasks.
- The economy (coins, XP, unlocks, ledger), recall (decks, cards, review log, blurts) and the customizer.
- From the fleet store: assignments, library and done ticks.
- A few settings: scheduler, look, port theme, timer presets and cycles, sound track.
- Uploaded notes (IndexedDB), compressed.

**What never leaves the device:**
- the Gemini key and model, and all of `fleet.settings` (Canvas, Todoist, Lodestar and Drive tokens);
- the calendar feed link, which often carries a private token, and connection statuses;
- sound on/off and volumes, camera view, motion, idle minutes and the crew server;
- the live timer (phase, clock, objective, cycles, prep), so a voyage running on one device never ticks on another;
- crew ghosts, the profile's name and email, and the tutorial and consent flags.

**Where it lives.** `firestore.rules` lets each account touch only `users/{its uid}`, and only these three kinds of document:
- `users/{uid}/state/{store}`: `{ json, version, rev, updatedAt }`. `json` holds the store's synced fields as text; `rev` is a random id per save.
- `users/{uid}/notes/{encodeURIComponent(id)}`: `{ data, title, updatedAt }`, where `data` is the note gzip-compressed. Notes over about 1 MB compressed (Firestore's document limit) stay on the device, and the Log in window lists them.
- `users/{uid}/meta/notes`: `{ ids }`, changed with `arrayUnion`/`arrayRemove` so two devices can't overwrite each other's list.

**How it decides.** The rules are pure code in `syncPlan.ts` (16 tests); the Firestore side is `lib/cloudSync.ts`.
- Each store syncs as one unit. `ship:sync-meta` (this browser only; left out of backups and of sync) remembers, per store, its fingerprint and `rev` at the last sync, and when this browser last changed it.
- **On start:** if only one side changed, it wins. If both changed, the later change wins; a local change with no recorded time, such as a restored backup, counts as the later.
- **While running:** local saves are noticed through `shipStorage` (`onShipStorageWrite`) and sent 2.5 s after the last change, or at once when the tab is hidden or closed. Changes from other devices arrive through Firestore listeners, are written into localStorage, and the store re-reads them (`persist.rehydrate()`). An incoming change beats an unsent local one when it's newer.
- **Notes** are matched by id (ids come from their contents). A note on one side only is new, unless the last sync saw it on both; then the other side deleted it.
- **A browser's first sync:**
  - account empty: this browser's progress goes up;
  - browser empty (`localHasProgress`): the account's comes down;
  - both have progress: `SyncChoiceDialog` asks which to keep. It offers "download this browser's progress first" and "Decide later", which pauses sync.

  Notes from both sides are always kept.
- **Known limit:** if two devices change the same store while one is offline, the later save wins and the other's changes to that store are lost (coins earned offline on both, for example). With both online, changes cross within seconds.

**Where it shows:**
- The top bar's name gets ✓ (synced), … (saving or connecting) or ! (paused or a problem), with a tooltip.
- The Log in window says what syncs, when it last synced and which notes are too big, and offers Try again or Choose what to keep.

**Loading:** `hooks/useCloudSync.ts` imports `lib/cloudSync.ts` (and Firestore with it, about 144 kB gzipped) only once someone is signed in.

**Related changes:**
- Delete account & data deletes the cloud copy first, then the account. If the cloud copy can't be deleted, nothing is deleted and the window says why.
- Start over, when signed in, signs out first (otherwise the cloud copy would come straight back), and says so.
- The sign-in reminder, tutorial tip, privacy text, storage notice and Log in window describe sync as it really works. Google Drive is described as an importer, not as sync.

**Switching it on** (the user, once, in the Firebase console for `ship-pwedo-pomo`):
1. Build → Firestore Database → Create database → Production mode. The location can't be changed later.
2. Its Rules tab: paste `firestore.rules` and Publish. (Or `firebase deploy --only firestore:rules`.)
3. Authentication → Settings → Authorized domains: make sure `silverninja71.github.io` is listed, or sign-in fails on the GitHub Pages address.
4. Publish the Firebase address again (`npm run build:site`, then `firebase deploy --only hosting`), since only GitHub Pages updates on a merge.

**Free tier:** Firestore's free (Spark) quota is shared by everyone using the site: 50,000 reads, 20,000 writes and 20,000 deletes a day, and 1 GiB stored. A sailor studying writes about once a minute (coins), plus once after each pause in typing. Over the quota, sync says so and catches up the next day.

**Testing it locally:**
- Start the emulators with `npx firebase-tools@15.35.0 emulators:start --only auth,firestore --project demo-ship` (it needs Java), then run `VITE_FIREBASE_EMULATORS=1 npx vite` in `apps/web`.
- That build uses a made-up `demo-ship` project and adds `window.__shipEmulatorSignIn(email)` for signing in without Google's popup. Real builds have neither (checked in the built bundle).

**Verified (2026-11-21)** against the emulators with Ship's real rules, in muted headless Chromium (26 checks):
- First sign-in uploads; a fresh browser downloads with no question asked.
- An edit on one browser appears on another within seconds, and a browser that was closed catches up when it opens.
- The Gemini key never reaches the cloud or another browser, while a synced setting does.
- A note uploaded on one browser appears on another and in its IndexedDB.
- A browser with its own progress is asked which to keep, and "Use my account's progress" replaces it.
- Another account can't read or change the data, an account can't write other kinds of document in its own folder, and nobody can read without signing in.
- Delete account & data removes the cloud copy and the account.
- No page errors.
- With every request refused, the top bar shows "!", the Log in window explains why, and local edits stay.

**Not verified:**
- The real Firebase project, which has no database yet (a request on 2026-11-21 got "Permission denied on the service").
- Real Google sign-in.
- Safari and phones.
- The free-tier limits under real use.
- Two devices offline at once.

## Conventions

- TypeScript strict mode, ES modules, relative imports end in `.js`.
- Comment density follows `shared-types`: short "why" comments, no noise.
- Keep `shared-types` the single source of truth. If a contract must change, change it there first, then fix every user.
