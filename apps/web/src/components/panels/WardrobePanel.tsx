// The Wardrobe: dress your sailor. Looks (skin, hair) are always free;
// hats, coats, accessories and study tools are earned.

import { useState } from "react";
import { levelForXp } from "@ship/shared-types";
import type { AvatarItemKind, AvatarLoadout, AvatarState } from "@ship/shared-types";
import { ACCESSORIES, COATS, COAT_COLORS, HAIR_COLORS, HAIR_STYLES, HATS, MAX_SAILOR_NAME, SKIN_TONES, STUDY_TOOLS, checkAvatarPurchase, ownsAvatarItem } from "@ship/ship-theme-kit";
import type { CatalogItem } from "@ship/ship-theme-kit";
import { useEconomy } from "../../stores/economyStore.js";
import { resolveAvatar, useCustomizer } from "../../stores/shipCustomizer.js";
import { useUi } from "../../stores/uiStore.js";
import { AvatarPreview } from "../AvatarPreview.js";
import { Doubloon, IconShirt } from "../icons.js";
import { Field, Panel, TextInput, cx } from "../ui.js";

const STATES: { id: AvatarState; label: string }[] = [
  { id: "SAILING_FOCUS", label: "Focus" },
  { id: "SHORE_LEAVE_BREAK", label: "Break" },
  { id: "DRIFTING_IDLE", label: "Dozing" },
];

export function WardrobePanel({ onClose }: { onClose: () => void }) {
  const avatar = useCustomizer((s) => s.avatar);
  const setAvatar = useCustomizer((s) => s.setAvatar);
  const inventory = useEconomy((s) => s.inventory);
  const doubloons = useEconomy((s) => s.doubloons);
  const xp = useEconomy((s) => s.xp);
  const buy = useEconomy((s) => s.buyAvatarItem);
  const toast = useUi((s) => s.toast);
  const [previewState, setPreviewState] = useState<AvatarState>("SAILING_FOCUS");
  const shown = resolveAvatar(avatar, inventory);
  const wallet = { doubloons, level: levelForXp(xp), inventory };

  const pick = (kind: AvatarItemKind, item: CatalogItem) => {
    if (!ownsAvatarItem(inventory, kind, item.id)) {
      const r = buy(kind, item.id);
      if (!r.ok) return toast(r.message, "warning");
      toast(`Bought ${item.name}.`, "reward");
    }
    setAvatar({ [kind]: item.id } as Partial<AvatarLoadout>);
  };

  const items = (kind: AvatarItemKind, catalog: readonly CatalogItem[], label: string) => (
    <section>
      <h3 className="mb-1.5 font-display font-extrabold">{label}</h3>
      <div className="flex flex-wrap gap-1.5">
        {catalog.map((item) => {
          const owned = ownsAvatarItem(inventory, kind, item.id);
          const on = shown[kind] === item.id;
          const check = owned ? null : checkAvatarPurchase(kind, item.id, wallet);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => pick(kind, item)}
              title={check && !check.ok ? check.message : item.description}
              aria-pressed={on}
              className={cx(
                "flex items-center gap-1.5 rounded-xl border-2 px-2.5 py-1 text-sm font-bold transition",
                on ? "border-ink bg-navy-900 text-cream-50" : "border-ink/15 bg-cream-50 hover:border-ink/50",
                check && !check.ok && "opacity-55",
              )}
            >
              {item.name}
              {!owned && (
                <span className="flex items-center gap-0.5 text-xs">
                  <Doubloon size={13} />
                  {item.price}
                  {check && !check.ok && check.reason === "level" ? ` · Lv ${item.levelRequired}` : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );

  const swatches = (colors: readonly string[], value: string, onPick: (c: string) => void, label: string) => (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === c.toLowerCase()}
          aria-label={c}
          onClick={() => onPick(c)}
          className={cx("size-8 rounded-full border-2 border-ink/40 transition", value.toLowerCase() === c.toLowerCase() && "ring-3 ring-brass-400 ring-offset-2 ring-offset-cream-100")}
          style={{ background: c }}
        />
      ))}
      <input type="color" value={value} onChange={(e) => onPick(e.target.value.toUpperCase())} className="size-8 cursor-pointer rounded-full border-2 border-ink/40 bg-transparent" aria-label={`Custom ${label.toLowerCase()}`} />
    </div>
  );

  return (
    <Panel title="Wardrobe" subtitle="Dress your sailor" icon={<IconShirt />} onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-[240px_1fr]">
        <div className="md:sticky md:top-0 md:self-start">
          <div className="grid place-items-center rounded-3xl border-2 border-ink/15 bg-gradient-to-b from-[#CDEFFB] to-cream-50">
            <AvatarPreview avatar={shown} state={previewState} size={220} />
          </div>
          <div className="mt-2 flex justify-center gap-1">
            {STATES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPreviewState(s.id)}
                className={cx("rounded-full px-2.5 py-0.5 text-xs font-bold", previewState === s.id ? "bg-navy-900 text-cream-50" : "bg-ink/8 hover:bg-ink/15")}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Sailor's name" hint="Your crew sees this name.">
            <TextInput value={avatar.name} maxLength={MAX_SAILOR_NAME} onChange={(e) => setAvatar({ name: e.target.value })} />
          </Field>
          <section>
            <h3 className="mb-1.5 font-display font-extrabold">Skin tone</h3>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Skin tone">
              {SKIN_TONES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={avatar.skin === s.id}
                  aria-label={s.name}
                  title={s.name}
                  onClick={() => setAvatar({ skin: s.id })}
                  className={cx("size-9 rounded-full border-2 border-ink/40", avatar.skin === s.id && "ring-3 ring-brass-400 ring-offset-2 ring-offset-cream-100")}
                  style={{ background: s.base }}
                />
              ))}
            </div>
          </section>
          {items("hair", HAIR_STYLES, "Hair")}
          {swatches(HAIR_COLORS, avatar.hairColor, (c) => setAvatar({ hairColor: c }), "Hair color")}
          {items("hat", HATS, "Hat")}
          {items("coat", COATS, "Coat")}
          {swatches(COAT_COLORS, avatar.coatColor, (c) => setAvatar({ coatColor: c }), "Coat color")}
          {items("accessory", ACCESSORIES, "Accessory")}
          {items("tool", STUDY_TOOLS, "Study tool")}
        </div>
      </div>
    </Panel>
  );
}
