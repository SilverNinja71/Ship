// Every store persists to localStorage under a "ship:" key. When storage is
// missing (tests, private mode) the stores simply don't persist.

import { createJSONStorage } from "zustand/middleware";

export const shipStorage = createJSONStorage(() => localStorage);

export const storageKey = (name: string) => `ship:${name}`;
