// Ship runs two ways: on this computer with `npm run dev`, or from the public
// website. The website has no crew server of its own, so the parts that need
// one say so instead of trying to reach the visitor's own computer.

const THIS_COMPUTER = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True on the public website, false under `npm run dev`. */
export const isHostedSite = typeof location !== "undefined" && !THIS_COMPUTER.has(location.hostname);

/** "http://localhost:8787" or "127.0.0.1:8787" is true; a real server's address, or nonsense, is false. */
export function pointsAtThisComputer(address: string): boolean {
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(address.trim()) ? address.trim() : `http://${address.trim()}`;
    return THIS_COMPUTER.has(new URL(withScheme).hostname);
  } catch {
    return false;
  }
}

/** A website visitor doesn't run a crew server, so the default address can't work for them. */
export function needsCrewServerAddress(address: string, hosted = isHostedSite): boolean {
  return hosted && pointsAtThisComputer(address);
}
