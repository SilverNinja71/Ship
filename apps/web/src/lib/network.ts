// How the web app reaches the outside world. Canvas sends no CORS headers, so
// it always goes through the crew server's /relay. Todoist and Google allow
// browser requests; Todoist falls back to the relay if a direct call fails.

import type { FetchLike } from "@ship/shared-types";
import { GOOGLE_DRIVE_READONLY_SCOPE, createRelayFetch } from "@ship/integrations";
import { useSettings } from "../stores/settingsStore.js";

export const browserFetch: FetchLike = (url, init) => fetch(url, init);

export function relayFetch(): FetchLike {
  return createRelayFetch(useSettings.getState().crewServer);
}

/** Tries the browser first; on a network/CORS failure (fetch throws) tries the relay. */
export function directThenRelay(): FetchLike {
  const relay = relayFetch();
  return async (url, init) => {
    try {
      return await browserFetch(url, init);
    } catch {
      return relay(url, init);
    }
  };
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: { client_id: string; scope: string; callback: (r: GoogleTokenResponse) => void; error_callback?: (e: { type?: string; message?: string }) => void }): {
      requestAccessToken(overrides?: { prompt?: string }): void;
    };
  };
}

let gisLoading: Promise<GoogleAccounts> | null = null;

/** Loads Google Identity Services only when the sailor clicks "Connect Google Drive". */
function loadGoogleIdentity(): Promise<GoogleAccounts> {
  const existing = (globalThis as { google?: { accounts?: GoogleAccounts } }).google?.accounts;
  if (existing) return Promise.resolve(existing);
  gisLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      const accounts = (globalThis as { google?: { accounts?: GoogleAccounts } }).google?.accounts;
      if (accounts) resolve(accounts);
      else reject(new Error("Google sign-in didn't load."));
    };
    script.onerror = () => {
      gisLoading = null;
      reject(new Error("Couldn't reach Google sign-in. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return gisLoading;
}

/** Asks Google for a read-only Drive token. Google shows its own sign-in window; call this from a click. */
export async function requestDriveToken(clientId: string): Promise<{ accessToken: string; expiresAt: number }> {
  const accounts = await loadGoogleIdentity();
  return new Promise((resolve, reject) => {
    const client = accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_READONLY_SCOPE,
      callback: (r) => {
        if (r.access_token) resolve({ accessToken: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 });
        else reject(new Error(r.error_description ?? r.error ?? "Google didn't grant access."));
      },
      error_callback: (e) => reject(new Error(e.message ?? e.type ?? "Google sign-in was closed.")),
    });
    client.requestAccessToken();
  });
}

export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
