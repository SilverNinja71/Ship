// Which panel is open, and the little toasts that pop up for rewards.

import { create } from "zustand";
import { newId } from "../lib/ids.js";

export type PanelId = "helm" | "log" | "flashcards" | "shipwright" | "wardrobe" | "crew" | "fleet" | "lookout" | "settings";

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
  openPanel(panel: PanelId | null): void;
  togglePanel(panel: PanelId): void;
  toast(text: string, tone?: ToastTone): void;
  dismissToast(id: string): void;
}

const TOAST_MS = 4500;

export const useUi = create<UiState>()((set, get) => ({
  panel: null,
  toasts: [],
  openPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set({ panel: get().panel === panel ? null : panel }),
  toast: (text, tone = "info") => {
    const toast = { id: newId(), text, tone, at: Date.now() };
    set({ toasts: [...get().toasts.slice(-3), toast] });
    setTimeout(() => get().dismissToast(toast.id), TOAST_MS);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
