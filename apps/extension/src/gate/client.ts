// The gate's link to the background worker, over chrome.runtime messages.
// The dev page uses this same client against a fake `chrome`.

import { sendToBackground } from "../shared/runtime.js";
import type { GateClient } from "./gate.js";

export function chromeGateClient(url: string): GateClient {
  return {
    cards: async () => (await sendToBackground({ t: "gate-cards" }))?.cards ?? [],
    passed: () => sendToBackground({ t: "gate-passed", url }),
    steerBack: () => sendToBackground({ t: "steer-back", url }),
  };
}
