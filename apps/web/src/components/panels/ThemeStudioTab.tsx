// Visual 10-theme kawaii Theme Studio tab inside WardrobePanel.

import { KAWAII_THEME_LIST } from "../../ship-engine/kawaiiThemes.js";
import type { KawaiiTheme } from "../../ship-engine/kawaiiThemes.js";
import { useEconomy } from "../../stores/economyStore.js";
import { useSettings } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { Doubloon } from "../icons.js";
import { Toggle, cx } from "../ui.js";

function ThemePreviewSwatch({ theme }: { theme: KawaiiTheme }) {
  const { canvas } = theme;
  return (
    <div
      className="relative h-24 w-full overflow-hidden rounded-[12px] border border-[var(--border-subtle)]"
      style={{
        background: `linear-gradient(180deg in oklch, ${canvas.skyTop} 0%, ${canvas.skyBottom} 68%, ${canvas.seaTop} 68%, ${canvas.seaBottom} 100%)`,
      }}
    >
      {/* Subtle pattern accent stripe */}
      {theme.patternKind === "gingham-stripes" && (
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, ${canvas.paperAlt} 0 18px, transparent 18px 36px)`,
          }}
        />
      )}
      {theme.patternKind === "midnight-moon" || theme.patternKind === "periwinkle-cosmos" ? (
        <div className="absolute inset-0 flex items-start justify-between p-2.5 text-xs">
          <span style={{ color: canvas.pastel }}>✦</span>
          <span style={{ color: canvas.accent }}>🪐</span>
        </div>
      ) : null}
      {theme.patternKind === "deep-sea" && (
        <div className="absolute inset-0 flex items-center justify-between px-4 text-base opacity-90">
          <span>🪼</span>
          <span style={{ color: canvas.accent }}>✦</span>
        </div>
      )}
      {/* Color chip dots */}
      <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5">
        <span className="size-3.5 rounded-full border border-[rgb(0_0_0_/_0.18)]" style={{ backgroundColor: canvas.paperBg }} />
        <span className="size-3.5 rounded-full border border-[rgb(0_0_0_/_0.18)]" style={{ backgroundColor: canvas.pastel }} />
        <span className="size-3.5 rounded-full border border-[rgb(0_0_0_/_0.18)]" style={{ backgroundColor: canvas.accent }} />
      </div>
      <span
        className="absolute right-2.5 bottom-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
        style={{ backgroundColor: canvas.paperBg, color: canvas.textInk === "#F6F3FA" || canvas.textInk === "#F2F7FD" ? "#4D453E" : canvas.textInk }}
      >
        {theme.isDark ? "Night" : "Day"}
      </span>
    </div>
  );
}

export function ThemeStudioTab() {
  const activeThemeId = useSettings((s) => s.activeThemeId);
  const showAffirmations = useSettings((s) => s.showAffirmations);
  const setSettings = useSettings((s) => s.set);
  const doubloons = useEconomy((s) => s.doubloons);
  const unlockedThemes = useEconomy((s) => s.unlockedThemes);
  const buyTheme = useEconomy((s) => s.buyTheme);
  const toast = useUi((s) => s.toast);

  const pickTheme = (theme: KawaiiTheme) => {
    const owned = theme.price === 0 || unlockedThemes.includes(theme.id);
    if (!owned) {
      const res = buyTheme(theme.id);
      if (!res.ok) {
        toast(res.message, "warning");
        return;
      }
      toast(`Unlocked ${theme.name} theme!`, "reward");
    }
    setSettings({ activeThemeId: theme.id, visualStyle: "tiny-ink" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3">
        <div>
          <p className="font-serif text-sm font-bold text-[var(--page-ink)]">
            Kawaii Study Worlds
          </p>
          <p className="text-xs text-[var(--muted-ink)]">
            Changes your ship sky, study desk props, crew accessories &amp; notebook colors.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--page-ink)]">
            <Doubloon size={16} />
            <span>{doubloons}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-1">
        <Toggle
          checked={showAffirmations}
          onChange={(v) => setSettings({ showAffirmations: v })}
          label="Daily theme affirmations"
          hint='Show gentle handwritten quotes like "doing my best" in your canvas world.'
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KAWAII_THEME_LIST.map((theme) => {
          const owned = theme.price === 0 || unlockedThemes.includes(theme.id);
          const equipped = activeThemeId === theme.id;
          const canAfford = doubloons >= theme.price;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => pickTheme(theme)}
              aria-pressed={equipped}
              className={cx(
                "flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-2 text-left transition-[transform,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
                equipped ? "ring-2 ring-[var(--page-ink)] bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]",
              )}
            >
              <ThemePreviewSwatch theme={theme} />
              <div className="mt-2.5 flex flex-1 flex-col justify-between px-1 pb-1">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-serif text-sm font-bold text-[var(--page-ink)]">
                      {theme.name}
                    </span>
                    {equipped ? (
                      <span className="rounded-full bg-[#FFF3A8] px-2 py-0.5 text-[10px] font-bold text-[#4D453E]">
                        Active
                      </span>
                    ) : owned ? (
                      <span className="text-[11px] font-semibold text-[var(--muted-ink)]">Owned</span>
                    ) : (
                      <span
                        className={cx(
                          "inline-flex items-center gap-0.5 text-xs font-bold",
                          canAfford ? "text-[var(--page-ink)]" : "text-[var(--muted-ink)]",
                        )}
                      >
                        <Doubloon size={13} />
                        {theme.price}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-snug text-[var(--muted-ink)]">{theme.tagline}</p>
                </div>
                <p className="mt-2 text-[11px] italic text-[var(--muted-ink)]">&ldquo;{theme.affirmation}&rdquo;</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
