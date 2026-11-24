// Which panel is open, and the little toasts that pop up for rewards.

import { create } from "zustand";
import { newId } from "../lib/ids.js";

export type PanelId = "helm" | "planner" | "log" | "notes" | "bay" | "flashcards" | "shipwright" | "wardrobe" | "crew" | "rooms" | "fleet" | "lookout" | "settings";

export type ToastTone = "reward" | "info" | "warning";

export interface Toast {
  id: string;
  text: string;
  tone: ToastTone;
  at: number;
}

export interface UiState {
  panel: PanelId | null;
  toasts: Toast[];
  /** A note for Study Sheets to start on, set by "Blurt this" in the Note Nook. */
  blurtNoteId: string | null;
  /** The Log in window, which any panel can ask for (Bottle Bay does). */
  loginOpen: boolean;
  setLoginOpen(open: boolean): void;
  /** A Study Room code from an invite link, waiting for the sailor to tap Join (never joined by itself). */
  roomInvite: string | null;
  /** Why the last try to come aboard `roomInvite` was refused (Hop back in from the banner), for its Join card. */
  roomInviteRefusal: string | null;
  setRoomInvite(code: string | null, refusal?: string | null): void;
  /** What was wrong with an invite link that didn't work (cut short, or an O for a 0), for the Join-with-a-code box. */
  roomLinkProblem: string | null;
  setRoomLinkProblem(problem: string | null): void;
  /** Opens Study Sheets with this note already picked. */
  blurtNote(noteId: string): void;
  /** Study Rooms should open at the game ("Answer" or "Open the game" in the banner); the game clears it once shown. */
  roomGameWanted: boolean;
  showRoomGame(): void;
  roomGameShown(): void;
  openPanel(panel: PanelId | null): void;
  togglePanel(panel: PanelId): void;
  toast(text: string, tone?: ToastTone): void;
  dismissToast(id: string): void;
}

const TOAST_MS = 4500;

export const useUi = create<UiState>()((set, get) => ({
  panel: null,
  toasts: [],
  blurtNoteId: null,
  loginOpen: false,
  roomInvite: null,
  roomInviteRefusal: null,
  setRoomInvite: (roomInvite, refusal = null) => set({ roomInvite, roomInviteRefusal: roomInvite ? refusal : null, ...(roomInvite ? { roomLinkProblem: null } : {}) }),
  roomLinkProblem: null,
  setRoomLinkProblem: (roomLinkProblem) => set({ roomLinkProblem }),
  setLoginOpen: (loginOpen) => set(loginOpen ? { loginOpen, panel: null, roomLinkProblem: null } : { loginOpen }),
  blurtNote: (noteId) => set({ blurtNoteId: noteId, panel: "log" }),
  roomGameWanted: false,
  showRoomGame: () => set({ roomGameWanted: true, panel: "rooms" }),
  roomGameShown: () => set({ roomGameWanted: false }),
  // A broken invite link's problem belongs to the Study Rooms panel's visit: it goes when that closes.
  openPanel: (panel) => set({ panel, ...(panel !== "rooms" ? { roomLinkProblem: null } : {}) }),
  togglePanel: (panel) => {
    const next = get().panel === panel ? null : panel;
    set({ panel: next, ...(next !== "rooms" ? { roomLinkProblem: null } : {}) });
  },
  toast: (text, tone = "info") => {
    const toast = { id: newId(), text, tone, at: Date.now() };
    set({ toasts: [...get().toasts.slice(-3), toast] });
    setTimeout(() => get().dismissToast(toast.id), TOAST_MS);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
