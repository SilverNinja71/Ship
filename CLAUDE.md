# Ship: notes for Claude, Gemini and the graphics AI

Read this first. It explains what Ship is, how the repo is laid out, the decisions already made, and what is left to build.

## What Ship is

A study app dressed up as a cartoon ship. You command a **Study Ship** and study at a desk on its deck or in the Captain's Quarters. A cartoon sailor avatar shows what you're doing. Focus timers are called **voyages**, and they pay **Doubloons** and XP. Crew rooms let friends study together, and the **Lookout** browser extension blocks distracting sites during a voyage.

Two pasted briefs shaped Ship:
- the **master blueprint** (2026-10-27), which set the features;
- the **monolithic specification** (2026-10-28), which split the work between three AIs and switched the art to sprites.

This file is the source of truth for the decisions made since then. Where the two briefs disagree, the 2026-10-28 one wins.

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
  - **The Lookout's video judge** (built): it reads a YouTube video's thumbnail, title, channel and description and decides PROCEED or BLOCKED against the current assignment.
  - **Feynman "blurt diff" grading** (not built yet): it decides which concepts in a blurt are mastered, partly grasped or missed.

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
│   │       │                sprites/ (the sprite loader and compositor: store, paint, ship, props, avatar, ocean)
│   │       ├── ships/       types.ts (the art contract), index.ts (drawShip), one file per HullStyle, parts/, decor.ts
│   │       ├── components/  Hud, VoyageDock, PanelHost, ui kit, icons, panels/ (Helm, Captain's Log, Flashcards,
│   │       │                Shipwright, Wardrobe, Crew, Fleet Log, Lookout, Settings)
│   │       ├── stores/      voyageStore, economyStore, shipCustomizer, recallStore, fleetStore, crewStore,
│   │       │                settingsStore, uiStore, activityStore, lookoutStore
│   │       ├── hooks/       useVoyageTicker, useIdleDetection, useKeyboard, useAmbiance, useLookoutBridge,
│   │       │                useCrewSync, useWebRTC
│   │       └── lib/         voyageLogic (the timer's rules), format, network, audio, rtcMesh, ids, storage
│   ├── extension/           "The Lookout", Chrome Manifest V3, bundled with esbuild (build.mjs)
│   │   └── src/ background/ content/ popup/ options/
│   └── signaling-server/    Node + ws: crew rooms, quest damage, WebRTC signaling, /relay
├── docs/                    art-brief.md (for the graphics AI), sprite-list.md (generated: every sprite, size, anchor)
└── packages/
    ├── shared-types/        THE CONTRACTS. Every app and package agrees on these shapes.
    ├── ship-theme-kit/      ship registry, parts catalogs (sails, figureheads, flags, desks), avatar catalog, prices,
    │                        sprite sheet specs + manifest validation (sprites.ts)
    ├── active-recall-engine/ SM-2 + FSRS schedulers, typed-answer grading, blurt diff engine
    └── integrations/        adapters: Canvas, Todoist, Lodestar, Google Drive, Parchment (.parchment), CSV cards
```

Commands (run from the repo root):

```bash
npm install          # once
npm run dev          # web app on http://localhost:5173 + crew server on :8787 + extension watch build
npm test             # every package's Vitest tests
npm run typecheck    # tsc (TypeScript 7) across the repo
npm run assets -w @ship/web   # check the graphics AI's sprites; rewrite assets/index.json and docs/sprite-list.md
```

Package names: `@ship/shared-types`, `@ship/ship-theme-kit`, `@ship/active-recall-engine`, `@ship/integrations`, `@ship/web`, `@ship/extension`, `@ship/signaling-server`.

## Status (2026-10-28, after the fourth session)

Sessions 1–3 are merged into `main` (pull request #1). Session 4 (this CLAUDE.md rewrite, the sprite contracts and the sprite compositor) is on branch `claude/build-foundations`, in pull request #2. Start new work on a fresh branch from `main` once #2 is merged.

Every build step now has working code:
- **`packages/shared-types`**: every contract.
  - Ships and avatars (`ship.ts`), voyages and economy (`voyage.ts`), flashcards and blurt (`recall.ts`), integrations and the relay (`integrations.ts`), the crew wire protocol (`crew.ts`), and the extension bridge (`lookout.ts`).
  - Session 2 added the `swing` extra, `Inventory`, `newReviewSchedule()`, `BLURT_STATUS_COLORS` and `ImportResult.assignments`.
- **`packages/ship-theme-kit`** (step 1), **`packages/active-recall-engine`** (step 2), **`apps/signaling-server`** (step 5) and **`packages/integrations`** (step 6), all with tests.
- **`apps/web`** (step 3), session 3: the scene engine, the 16 ships' artwork and the chibi sailors (both procedural, to be replaced by sprites), every store and every panel. Details below.
- **`apps/extension`** (step 4), session 3: the Lookout. Details below.
- **Sprites** (session 4): the contracts (`shared-types/sprite.ts`), the sheet specs and manifest checks (`ship-theme-kit/sprites.ts`), the compositor (`apps/web/src/ship-engine/sprites/`), the asset check script and the art brief. No art has arrived yet, so everything still draws procedurally. Details in "Decisions made in session 4".

`npm test` runs 707 tests, and all pass:

| Package | Tests |
|---|---|
| ship-theme-kit (catalogs 22, sprite specs 14) | 36 |
| active-recall-engine | 41 |
| crew server | 100 |
| integrations | 104 |
| extension | 171 |
| web (ship art 147, sailor art 68, stores and voyage rules 23, sprite engine 11, asset checks 6) | 255 |

`npm run typecheck` passes for all 7 workspaces, and `npm run build -w @ship/web` builds.

**Verified in session 3** with Playwright's headless Chromium (muted, no pop-ups). Claude Code cloud sessions have no built-in browser pane, so this is the stand-in. Never use the user's own Chrome.
- Screenshots of the deck, the quarters, every panel and a phone-sized layout, with sample data.
- Two browser contexts in one crew room against the real crew server: presence, a shout, and a crewmate at the galley table.
- The built extension loaded into Chromium with the real web app: it connects, the Siren Gate blocks a (faked) YouTube home page during a voyage, and steering back pays exactly 50 doubloons once.

**Verified in session 4** with throwaway placeholder sprites (plain shapes, deleted afterwards, never committed) for the Woolly Wanderer, square sails, the ram, the Sun-Hat Skull, the citrus tree, the Captain's Desk, the galley table, the starter sailor and the tropical sea:
- They passed `npm run assets`.
- On the deck: the hull layers and rigging line up with the layout markers, sails are furled when docked and billow under sail, and the flag waves.
- The sailor is tinted and posed in all three states and all break activities. Sailors without a complete set stay procedural, and the procedural helm and bell sit beside sprite parts.
- The quarters' cabin-room sprite shows the sea through its porthole.

**Never checked for real:**
- A real Canvas, Todoist or Drive account, a real Parchment file or `study.json`, real YouTube, or a real Gemini key.
- The Lookout's options page has a **Check key** button for Gemini.
- Parchment's Swift source still needs comparing (see session 2 notes).

Installed versions: turbo 2.11, typescript 7.0, vitest 5.0, vite 8.3, @vitejs/plugin-react 6.1, react 19.3, tailwindcss + @tailwindcss/vite 4.3, zustand 5.0, ws 8.22, tsx 4.23 (crew server and web scripts), esbuild 0.28, @types/chrome 0.3, @types/node 26.6.

## Next steps (from the 2026-10-28 spec)

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
4. **The Lookout (Gemini).** Built in session 3. It still needs testing with a real key.
5. **Gemini blurt grading.** Grade the Captain's Log semantically with Gemini, and keep the current heuristic engine as the fallback when there's no key or no network. **Open question:** where the web app gets the key: its own setting, or borrowed from the Lookout over the bridge.

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

**Open question:** the 2026-10-28 spec lists only five Mythic ships and leaves out the Gorgon Stone Trireme and the Sasquatch Cedar Timber-Brig. Both are still in the code. Ask the user before removing them.

## Web app design

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

- **Bridge content script** on the Ship web app (`http://localhost/*` and `http://127.0.0.1/*`; only active if `<meta name="ship-app">` is present). It relays the voyage state and a few due flashcards to the extension, and sends reward events back. The messages are the `WebToLookout` / `LookoutToWeb` types in `shared-types/lookout.ts`. The web app pays each reward event once (by id), then acks it.
- **Guarding** happens only while a focus block runs:
  - YouTube home, Shorts and feeds are always blocked.
  - A YouTube watch page is judged by **Gemini Flash** from its title, channel, description, an optional transcript excerpt and the thumbnail, checked against the active assignment. Verdicts are cached per video.
  - **The answer's shape:** the spec writes it as `{ "verdict": "PROCEED" | "BLOCKED", "confidence": number, "reason": string }`. The code asks Gemini for `decision` instead, to match `LookoutVerdict.decision` in shared-types, and accepts either name.
  - With no API key, a keyword heuristic decides and is labeled as such.
- **Gemini setup**: the user types their own key on the options page. The model name is a setting, because Gemini model IDs change. Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with header `x-goog-api-key`, using `responseMimeType: application/json`.
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
- **SM-2 needs checking against Parchment.** Parchment's Swift source wasn't on this machine, so SM-2 follows the formula above plus classic SM-2. When the source is at hand, check these choices against `ReviewSchedule.next()`:
  - The new interval uses the ease from before the review.
  - Ease changes on failed reviews too.
  - A lapse counts only when a learned card (repetitions > 0) fails.
  - A failed card stores `interval: 0`.
  - Rating 1 brings the card back in 1 minute, and rating 2 in 10 minutes.
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
- **`importFile(name, data)`** is the one entry point for dropped files: `.parchment`, `study.json`, `.csv`/`.tsv`/`.txt` and `.ics`.
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
- **Plain text:** a `.txt` or `.md` file that isn't cards becomes a note with `source: "paper"`, because there is no neutral `IntegrationId` for files. Ask the user whether a `"file"` source is wanted.
- **Parchment needs checking against the real Swift source and a real file:**
  - `.parchment` is assumed to be `PropertyListEncoder` output (plain dicts, native plist dates), with NSKeyedArchiver and JSON as fallbacks.
  - Field names are guessed tolerantly. The lists live in `parchment/archive.ts` and `parchment/study.ts`.

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
- **Sound:** WebAudio synthesizes a sea ambience and bell chimes, with no audio files. The `AudioContext` is only created after the user turns sound on; it's off by default.
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
- **Load time:** the production bundle is about 630 kB (207 kB gzipped). If it matters, code-split the panels with `React.lazy`.

### Lookout extension
- **Internals:**
  - Logic with no Chrome calls lives in `src/core`. The worker logic in `src/background/lookout.ts` gets Chrome passed in, so tests can fake it.
  - State lives in `chrome.storage.local`, and every change runs under a lock. A one-minute alarm handles staleness, the midnight reset, passes and the toolbar badge.
- **Permissions:**
  - `storage`, `alarms` and `scripting`.
  - Hosts: YouTube, `i.ytimg.com`, Gemini, and `http://localhost/*` / `http://127.0.0.1/*` (every port).
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
  - After an error or 15 s, the keyword check decides, and is labeled as such.
- **The Siren Gate:**
  - It lives in a closed shadow DOM with no `innerHTML`, which is safe under YouTube's Trusted Types.
  - "Close" answers count as right. A leisure pass opens the whole site.
  - The transcript excerpt is always `null`, because YouTube's caption URLs are signed.
- **Dev pages:** `dist/dev/gate.html?scenario=gemini|heuristic|shorts|few-cards|blocklist|cleared`, plus `dist/dev/popup.html` and `dist/dev/options.html`. Serve `dist/` over http to view them.

### Next ideas (after the "Next steps" above)
- Compare SM-2 and the Parchment parsers with Parchment's Swift source.
- Decide on Paper (the art app) imports and on a neutral `"file"` IntegrationId for plain text.
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

## Conventions

- TypeScript strict mode, ES modules, relative imports end in `.js`.
- Comment density follows `shared-types`: short "why" comments, no noise.
- Keep `shared-types` the single source of truth. If a contract must change, change it there first, then fix every user.
