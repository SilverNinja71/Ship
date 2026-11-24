// The Match board: pick a question tile and its answer tile to clear the pair. Practice's Match
// and the Study Rooms' Tidy the Deck both use it. The board keeps its own picks; the caller keeps
// the clock, counts mix-ups (onMistake) and hears when the last pair goes (onCleared).

import { useEffect, useRef, useState } from "react";
import type { MatchTile } from "@ship/active-recall-engine";
import { cx } from "../ui.js";

/** How long a wrong pair stays coral. */
const WRONG_FLASH_MS = 450;

export function MatchTiles({
  tiles,
  onCleared,
  onMistake,
  disabled = false,
}: {
  tiles: readonly MatchTile[];
  onCleared: () => void;
  onMistake?: () => void;
  disabled?: boolean;
}) {
  const [board, setBoard] = useState(tiles);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const flash = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new board starts with nothing picked or cleared.
  if (board !== tiles) {
    setBoard(tiles);
    setCleared(new Set());
    setSelected(null);
    setWrong([]);
  }

  useEffect(
    () => () => {
      if (flash.current) clearTimeout(flash.current);
    },
    [],
  );

  const pick = (tile: MatchTile) => {
    if (disabled || cleared.has(tile.id)) return;
    if (!selected) return setSelected(tile.id);
    if (selected === tile.id) return setSelected(null);
    const first = tiles.find((t) => t.id === selected);
    if (!first) return setSelected(tile.id);
    setSelected(null);
    if (first.cardId === tile.cardId && first.side !== tile.side) {
      const next = new Set([...cleared, first.id, tile.id]);
      setCleared(next);
      if (next.size === tiles.length) onCleared();
    } else {
      onMistake?.();
      setWrong([first.id, tile.id]);
      if (flash.current) clearTimeout(flash.current);
      flash.current = setTimeout(() => setWrong([]), WRONG_FLASH_MS);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {tiles.map((t) => {
        const gone = cleared.has(t.id);
        return (
          <button
            key={t.id}
            type="button"
            disabled={gone || disabled}
            onClick={() => pick(t)}
            aria-pressed={selected === t.id}
            className={cx(
              "min-h-20 rounded-xl border p-2 text-sm leading-snug transition-[opacity,background-color] duration-200",
              gone && "invisible",
              !gone && disabled && "opacity-60",
              !gone && selected === t.id && "border-navy-600 bg-[var(--surface-3)] font-bold",
              !gone && wrong.includes(t.id) && "border-coral-700 bg-coral-500/20",
              !gone && selected !== t.id && !wrong.includes(t.id) && "border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
            )}
          >
            {t.text}
          </button>
        );
      })}
    </div>
  );
}
