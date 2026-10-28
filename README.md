# Ship

A study app where you command a cartoon study ship. Focus timers ("voyages") earn Doubloons for new ships and outfits, flashcards and blurting practice active recall, crew rooms let friends study together, and the Lookout browser extension keeps distracting sites away while you sail.

```bash
npm install
npm run dev     # the web app on http://localhost:5173, the crew server on :8787, and an extension watch build
npm test        # every package's tests
```

- **The web app** (`apps/web`): your ship on an animated sea. Set sail from the dock at the bottom (or press Space), and open the panels from the toolbar: the Navigation Map, the Captain's Log (blurting), Flashcards, the Shipwright, the Wardrobe, Crew, the Fleet Log (Canvas, Todoist, calendars, Google Drive, Parchment imports), the Lookout and Settings. Sound is off until you turn it on.
- **The crew server** (`apps/signaling-server`): crew rooms, the crew quest, video calls between crewmates, and a relay for Canvas (which blocks requests from web pages).
- **The Lookout** (`apps/extension`): build it with `npm run build -w @ship/extension`, then in Chrome open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose `apps/extension/dist`.

See [CLAUDE.md](CLAUDE.md) for the design, the decisions so far and what's next.
