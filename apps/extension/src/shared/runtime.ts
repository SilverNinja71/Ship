// chrome.runtime.sendMessage with types. Resolves null instead of throwing
// when the worker is gone (e.g. the extension was reloaded under the page).

import type { ReplyTo, ToBackground } from "./messages.js";

export async function sendToBackground<M extends ToBackground>(message: M): Promise<ReplyTo<M> | null> {
  try {
    const reply = (await chrome.runtime.sendMessage(message)) as ReplyTo<M> | undefined;
    return reply ?? null;
  } catch {
    return null;
  }
}
