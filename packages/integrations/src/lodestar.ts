// Lodestar (lodestarplanner.com, the user's own planner). The only known
// Lodestar endpoints belong to its browser extension (/api/extension/auth/
// session, /api/canvas/sync, ...); there is no known API for reading tasks,
// so Ship doesn't guess one. Instead it imports a calendar (.ics) export or
// feed of the planner.

import { parseIcs } from "./ics.js";
import type { IcsImport } from "./ics.js";

export function importLodestarCalendar(text: string): IcsImport {
  return parseIcs(text, "lodestar", { defaultKind: "task" });
}
