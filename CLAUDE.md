# Ship: notes for Claude (and Gemini)

Read this first. It explains what Ship is, how the repo is laid out, the decisions already made, and what is left to build.

## What Ship is

A study app dressed up as a cartoon ship. You command a **Study Ship** and study at a desk on its deck or in the Captain's Quarters. A cartoon sailor avatar shows what you're doing. Focus timers are called **voyages**, and they pay **Doubloons** and XP. Crew rooms let friends study together, and the **Lookout** browser extension blocks distracting sites during a voyage.

The original spec was a long pasted brief (Project "Ship" master blueprint, 2026-10-27). This file is the source of truth for the decisions made since then.

## The user

- New to coding and wants to learn. Explain what you did in plain language and define jargon.
- Test pages only in Claude's **built-in browser pane**, never the user's own Chrome. Make no sound and open no pop-up windows. Ambient audio in the app must stay **off by default**.
- Mind the weekly usage cap: check usage between phases and stop well below it.

## Repo layout

npm workspaces + Turborepo + TypeScript. There is no build step for packages: each package's `exports` points straight at `src/index.ts`, and Vite, Vitest, tsx and esbuild all read TypeScript directly.

```text
ship/
├── apps/
│   ├── web/                 Vite 8 + React 19 + Tailwind 4 + Zustand 5. The main app.
│   │   └── src/
│   │       ├── ship-engine/ ShipCanvas.tsx, ShipRenderer.ts, AvatarRenderer.ts, OceanEngine.ts, ParticleFX.ts
│   │       ├── ships/       per-hull drawing code (one file per HullStyle family)
│   │       ├── components/  HUD + modals (Helm/Navigation Map, Captain's Log, Flashcards, Shipwright, Wardrobe, Crew, Fleet Log, Lookout)
│   │       ├── stores/      voyageStore, economyStore, shipCustomizer, recallStore, fleetStore, crewStore, settingsStore
│   │       └── hooks/       useWebRTC, useAmbiance, useKeyboard, useIdleDetection, useLookoutBridge
│   ├── extension/           "The Lookout", Chrome Manifest V3, bundled with esbuild (build.mjs)
│   │   └── src/ background/ content/ popup/ options/
│   └── signaling-server/    Node + ws: crew rooms, quest damage, WebRTC signaling, /relay
└── packages/
    ├── shared-types/        THE CONTRACTS. Every app and package agrees on these shapes.
    ├── ship-theme-kit/      ship registry, parts catalogs (sails, figureheads, flags, desks), avatar catalog, prices
    ├── active-recall-engine/ SM-2 + FSRS schedulers, typed-answer grading, blurt diff engine
    └── integrations/        adapters: Canvas, Todoist, Lodestar, Google Drive, Parchment (.parchment), CSV cards
```

Commands (run from the repo root):

```bash
npm install          # once
npm run dev          # web app on http://localhost:5173 + crew server on :8787 + extension watch build
npm test             # every package's Vitest tests
npm run typecheck    # tsc (TypeScript 7) across the repo
```

Package names: `@ship/shared-types`, `@ship/ship-theme-kit`, `@ship/active-recall-engine`, `@ship/integrations`, `@ship/web`, `@ship/extension`, `@ship/signaling-server`.

## Status (2026-10-28, end of the second session)

Work is on the branch `claude/build-foundations` (not merged into `main` yet).

Done:
- Monorepo scaffold: root `package.json` (workspaces), `turbo.json`, `tsconfig.base.json`, a `package.json` and `tsconfig.json` for every workspace, and `npm install` run with the dependencies below.
- **`packages/shared-types`**: every contract. Ships and avatars (`ship.ts`), voyages and economy (`voyage.ts`), flashcards and blurt (`recall.ts`), integrations and the relay (`integrations.ts`), the crew wire protocol (`crew.ts`), and the extension bridge (`lookout.ts`). Session 2 added the `swing` extra, `Inventory`, `newReviewSchedule()`, `BLURT_STATUS_COLORS` and `ImportResult.assignments`.
- **`packages/ship-theme-kit`** (build step 1), with tests.
- **`packages/active-recall-engine`** (build step 2), with tests.
- **`apps/signaling-server`** (build step 5), with tests, including an end-to-end test with two real WebSocket clients.
- **`packages/integrations`** (build step 6), with tests. It is only tested against faked responses and generated fixtures. Nothing has been run against a real Canvas, Todoist or Drive account, or a real Parchment file, yet. A Canvas sync through the real crew-server relay was checked end to end, with a fake Canvas behind it.

`npm test` runs 267 tests, and all pass. `npm run typecheck` passes for the five finished workspaces. It fails for `@ship/web` and `@ship/extension` with "No inputs were found" until they get source files.

Not started yet: the web app (step 3), the Lookout extension (step 4) and the browser checks (step 7). Their `src/` folders don't exist yet.

Installed versions: turbo 2.11, typescript 7.0, vitest 5.0, vite 8.3, @vitejs/plugin-react 6.1, react 19.3, tailwindcss + @tailwindcss/vite 4.3, zustand 5.0, ws 8.22, tsx 4.23, esbuild 0.28, @types/chrome 0.3.

## Build plan (next steps, in order)

Steps 1, 2, 5 and 6 are done (see "Decisions made in session 2" below). Next up: 3, then 4, then 7.

1. ✅ **ship-theme-kit**: the 16 ships below as `ShipDefinition`s, the parts catalogs, the avatar catalog, prices and level gates, and a `validateLoadout()`.
2. ✅ **active-recall-engine** (with tests):
   - SM-2 that copies Parchment's `ReviewSchedule.next()` exactly. Ratings 1–2 reset the card and bring it back in 1 or 10 minutes. Ease = max(1.3, ease + 0.1 − (5−q)(0.08 + (5−q)·0.02)).
   - FSRS-4.5 with the default weights. Rating mapping: 1–2 → Again, 3 → Hard, 4 → Good, 5 → Easy.
   - Typed-answer grading (normalize, token overlap + Levenshtein) that suggests a rating.
   - Blurt diff: pull weighted key concepts out of reference notes, then fuzzy-match the blurt against them to get mastered / partial / missed and a coverage score. Mastered shows seafoam green; missed shows coral red.
3. **web app** (the biggest piece; see "Web app design").
4. **Lookout extension** (see "Lookout design"). The Siren Gate should grade typed answers with `gradeTypedAnswer` from `@ship/active-recall-engine`. Add that package to `apps/extension/package.json` before building (esbuild bundles workspace packages).
5. ✅ **signaling server** (see "Crew server design").
6. ✅ **integrations** (see "Integrations").
7. Verify: unit tests, then run the web app in the built-in browser pane (muted) and take screenshots. Test crew rooms with two tabs. Add a dev page to the extension that mounts the Siren Gate with a fake `chrome` object, so it can be checked in the pane, because the pane can't load extensions.

Steps 4–6 depend only on `shared-types`, so they can be built in parallel by separate agents (Claude or Gemini). Each agent stays inside its own folder and must not run `npm install` while other agents are working. Install new dependencies once, up front, from the root.

## Ships (original names on purpose)

The brief named One Piece ships (Going Merry, Thousand Sunny, Baratie, Polar Tang, Red Force) and "Nami's Orange Grove". Those names and designs belong to Eiichiro Oda/Shueisha/Toei. Ship uses **original ships that keep the same vibe**, so the app is safe to share. Don't reintroduce the trademarked names.

Buccaneer Fleet (the One Piece-inspired set):
- **Woolly Wanderer**: small caravel, ram figurehead, grassy lawn deck. The free starter ship.
- **Golden Mane**: sunny brig, lion figurehead, lawn deck, a swing.
- **Floating Galley**: fish-shaped kitchen barge with fins and a kitchen chimney.
- **Sunfish**: round yellow submarine with portholes and a periscope.
- **Crimson Corsair**: red galleon with cannons.

Navy & Military:
- **Admiralty Battleship**: white and navy steel, turrets.
- **Ironwood War Galleon**: an 18th-century three-master with gun ports.
- **Riveted Ironclad**: low sloped casemate and one stack.
- **Thunder Dreadnought**: brass telescopes and a war-room desk.

Mythic (names from the brief, all generic or public-domain):
- **Pegasus Celestial Cloud-Galleon**: wings, feathered sails, a twilight cloud sea, stardust. Aviator goggles suit it.
- **Merfolk Coral Caravel**: bioluminescent, coral rails, deck mikan trees that drop zest coins when clicked.
- **Chalkydri Solar Ark**: 12 fiery sails, brass astrolabe, stained-glass solarium.
- **Alebrijes Spirit Galleon**: neon folk-art chimeras, papel picado sails, paper lanterns, copal smoke.
- **Kaiju Behemoth Carrier**: a scrap barge with a friendly leviathan swimming alongside in neon mist.
- **Gorgon Stone Trireme**: marble deck, oars, ivy, olive leaves.
- **Sasquatch Cedar Timber-Brig**: redwood logs, a cabin woodstove, pine needles.

## Web app design

- **Rendering**: Canvas 2D, a side-on cartoon "2.5D" view. The deck is drawn as a thin top-down band so avatars can stand on it.
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
  - A YouTube watch page is judged by **Gemini Flash** from its title, channel, description, an optional transcript excerpt and the thumbnail, checked against the active assignment. The answer is PROCEED or BLOCKED with a reason. Verdicts are cached per video.
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

## Conventions

- TypeScript strict mode, ES modules, relative imports end in `.js`.
- Comment density follows `shared-types`: short "why" comments, no noise.
- Keep `shared-types` the single source of truth. If a contract must change, change it there first, then fix every user.
