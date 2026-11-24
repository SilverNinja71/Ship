// Which panel is open, and the little toasts that pop up for rewards.

import { create } from "zustand";
import { newId } from "../lib/ids.js";

export type PanelId = "helm" | "planner" | "log" | "notes" | "bay" | "flashcards" | "shipwright" | "wardrobe" | "crew" | "fleet" | "lookout" | "settings";

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
  /** Opens Study Sheets with this note already picked. */
  blurtNote(noteId: string): void;
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
  setLoginOpen: (loginOpen) => set(loginOpen ? { loginOpen, panel: null } : { loginOpen }),
  blurtNote: (noteId) => set({ blurtNoteId: noteId, panel: "log" }),
  openPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set({ panel: get().panel === panel ? null : panel }),
  toast: (text, tone = "info") => {
    const toast = { id: newId(), text, tone, at: Date.now() };
    set({ toasts: [...get().toasts.slice(-3), toast] });
    setTimeout(() => get().dismissToast(toast.id), TOAST_MS);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
