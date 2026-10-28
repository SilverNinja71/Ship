// Random ids for things Ship creates itself (records, decks, cards).

export function newId(prefix = ""): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}:${id}` : id;
}
