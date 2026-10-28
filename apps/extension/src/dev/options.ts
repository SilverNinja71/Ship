// dist/dev/options.html: the real options page over fake storage and
// permissions. "Check key" answers from a pretend Gemini.

import { startOptions } from "../options/options.js";
import { fakeResponse, installFakeChrome, memoryStore } from "./fakeChrome.js";

const store = memoryStore({
  settings: { geminiApiKey: "", geminiModel: "gemini-flash-latest", shipUrl: "http://localhost:5173", blockedSites: ["reddit.com", "twitter.com"] },
});
const fetch = async () => fakeResponse({ name: "models/gemini-flash-latest", displayName: "Gemini Flash Latest" });
installFakeChrome({ store, fetch });
void startOptions(document, fetch).then(() => {
  document.documentElement.dataset.ready = "1";
});
