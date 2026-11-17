// The Shipwright: buy ships, switch between them, and buy or fit parts.
// Styled in warm kawaii pastel stationery tones, with kawaii pastel ship previews in Tiny Ink mode.

import { useEffect, useRef, useState } from "react";
import { levelForXp } from "@ship/shared-types";
import type { PartKind, ShipCategory, ShipDefinition, ShipLoadout } from "@ship/shared-types";
import {
  ENVIRONMENTS,
  SHIPS,
  SHIP_CATEGORIES,
  checkPartPurchase,
  checkShipPurchase,
  defaultLoadout,
  getPart,
  ownsPart,
  ownsShip,
  partsForShip,
} from "@ship/ship-theme-kit";
import type { CatalogItem } from "@ship/ship-theme-kit";
import { formatNumber } from "../../lib/format.js";
import { alpha, linearGradient } from "../../ship-engine/draw.js";
import { STILL_FRAME } from "../../ship-engine/types.js";
import { drawShip, shipLayout } from "../../ships/index.js";
import { getKawaiiTheme, toKawaiiPastelEnv, toKawaiiPastelShip } from "../../ships/tinyInkShip.js";
import { useEconomy } from "../../stores/economyStore.js";
import { useSettings } from "../../stores/settingsStore.js";
import { resolveActiveShip, useCustomizer } from "../../stores/shipCustomizer.js";
import { useUi } from "../../stores/uiStore.js";
import { Doubloon, IconHammer } from "../icons.js";
import { ShipThumbnail } from "../ShipThumbnail.js";
import { Badge, Button, Panel, Tabs, cx } from "../ui.js";

type Tab = "ships" | "parts";

/** Renders a ship in kawaii pastel colors when Tiny Ink mode is active, or delegates to ShipThumbnail in Storybook mode. */
function KawaiiShipPreview({
  ship,
  loadout,
  width = 340,
  height = 190,
  className,
}: {
  ship: ShipDefinition;
  loadout?: ShipLoadout;
  width?: number;
  height?: number;
  className?: string;
}) {
  const tinyInk = useSettings((s) => s.visualStyle === "tiny-ink");
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify([ship.id, loadout ?? null, tinyInk]);

  useEffect(() => {
    if (!tinyInk) return;
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const activeShip = toKawaiiPastelShip(ship);
    const env = toKawaiiPastelEnv(ENVIRONMENTS[ship.environment]);
    const layout = shipLayout(activeShip);
    const b = layout.bounds ?? { left: -560, right: 600, top: -640, bottom: 170 };
    const unit = Math.min(
      (width * 0.9) / (b.right - b.left),
      (height * 0.86) / (Math.max(b.bottom, layout.waterline + 40) - b.top),
    );
    const seaY = height * 0.08 + (layout.waterline - b.top) * unit;

    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, seaY, [
      [0, env.skyTop],
      [1, env.skyBottom],
    ]);
    ctx.fillRect(0, 0, width, height);

    // Soft kawaii clouds
    ctx.fillStyle = alpha("#FFFFFF", 0.72);
    for (const [cx0, cy0, r] of [
      [width * 0.18, seaY * 0.28, 12],
      [width * 0.24, seaY * 0.26, 15],
      [width * 0.76, seaY * 0.22, 13],
      [width * 0.82, seaY * 0.24, 10],
    ]) {
      ctx.beginPath();
      ctx.arc(cx0, cy0, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(width / 2 - ((b.left + b.right) / 2) * unit, seaY - layout.waterline * unit);
    ctx.scale(unit, unit);
    drawShip(ctx, activeShip, loadout ?? defaultLoadout(activeShip), STILL_FRAME);
    ctx.restore();

    const seaColor = env.sea[2];
    ctx.fillStyle = linearGradient(ctx, 0, seaY, 0, height, [
      [0, seaColor],
      [1, env.sea[1] ?? seaColor],
    ]);
    if (env.cloudSea) {
      const cr = 14 * (width / 240);
      const step = cr * 1.35;
      ctx.beginPath();
      for (let x = -cr; x <= width + cr; x += step) {
        ctx.moveTo(x + cr, seaY);
        ctx.arc(x, seaY, cr, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-10, height + 10);
    const waveAmp = env.cloudSea ? 2.5 : 2;
    for (let x = -10; x <= width + 10; x += 6) {
      ctx.lineTo(x, seaY + Math.sin(x * 0.04) * waveAmp);
    }
    ctx.lineTo(width + 10, height + 10);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = env.foam ? alpha(env.foam, 0.85) : "rgba(255,255,255,0.75)";
    ctx.beginPath();
    for (let x = -10; x <= width + 10; x += 6) {
      const y = seaY + Math.sin(x * 0.04) * waveAmp;
      if (x === -10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [ship, key, width, height, tinyInk]);

  if (!tinyInk) {
    return <ShipThumbnail ship={ship} loadout={loadout} width={width} height={height} fluid className={className} />;
  }

  return (
    <canvas
      ref={ref}
      style={{ width: "100%", height: "auto", aspectRatio: `${width} / ${height}` }}
      className={className}
      aria-label={`The ${ship.name}`}
      role="img"
    />
  );
}

export function ShipwrightPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("ships");
  const doubloons = useEconomy((s) => s.doubloons);
  const xp = useEconomy((s) => s.xp);
  return (
    <Panel
      title="Shipwright"
      subtitle={`Level ${levelForXp(xp)} · ${formatNumber(doubloons)} doubloons in the chest`}
      icon={<IconHammer />}
      onClose={onClose}
      wide
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "ships", label: "Ships" },
          { id: "parts", label: "Parts for your ship" },
        ]}
      />
      {tab === "ships" ? <Ships /> : <Parts />}
    </Panel>
  );
}

function Price({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Doubloon size={15} /> {formatNumber(amount)}
    </span>
  );
}

function Ships() {
  const inventory = useEconomy((s) => s.inventory);
  const doubloons = useEconomy((s) => s.doubloons);
  const xp = useEconomy((s) => s.xp);
  const buyShip = useEconomy((s) => s.buyShip);
  const activeShipId = useCustomizer((s) => s.activeShipId);
  const setActiveShip = useCustomizer((s) => s.setActiveShip);
  const toast = useUi((s) => s.toast);
  const [category, setCategory] = useState<ShipCategory>("buccaneer");
  const wallet = { doubloons, level: levelForXp(xp), inventory };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SHIP_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cx(
              "rounded-full border px-3 py-1 font-serif text-sm transition",
              category === c.id
                ? "border-[#A29C93] bg-[#FFF3A8] font-bold text-[#5D564E] shadow-[2px_2px_0_#EAE5DA]"
                : "border-[#A29C93]/40 bg-[#FFFDF7] text-[#6D655C] hover:border-[#A29C93]",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SHIPS.filter((s) => s.category === category).map((ship) => {
          const owned = ownsShip(inventory, ship.id);
          const active = ship.id === activeShipId;
          const check = checkShipPurchase(ship.id, wallet);
          const kawaii = getKawaiiTheme(ship.id);
          return (
            <li
              key={ship.id}
              style={{ backgroundColor: kawaii?.cardBg ?? "#FFFDF7" }}
              className={cx(
                "overflow-hidden rounded-3xl border transition shadow-[3px_3px_0_#EAE5DA]",
                active ? "border-[#C9A66B] ring-2 ring-[#FFF3A8]" : "border-[#A29C93]/50",
              )}
            >
              <KawaiiShipPreview ship={ship} width={340} height={190} className="block" />
              <div className="p-3.5 font-serif text-[#6D655C]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold leading-tight text-[#5D564E]">{ship.name}</h3>
                    {kawaii && (
                      <span
                        style={{ backgroundColor: kawaii.badgeBg, color: kawaii.badgeText }}
                        className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                      >
                        {kawaii.pastelLabel}
                      </span>
                    )}
                  </div>
                  {active ? (
                    <Badge tone="brass">Your ship</Badge>
                  ) : owned ? (
                    <Badge tone="seafoam">{ship.price === 0 ? "Starter" : "Owned"}</Badge>
                  ) : null}
                </div>
                <p className="mt-1.5 min-h-10 text-xs leading-relaxed text-[#8E887F]">{ship.tagline}</p>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  {owned ? (
                    <span className="text-xs text-[#8E887F]">{ship.price ? "In your fleet" : "Default starter ship"}</span>
                  ) : (
                    <span className="text-xs font-bold text-[#5D564E]">
                      <Price amount={ship.price} /> · Lv {ship.levelRequired}
                    </span>
                  )}
                  {active ? null : owned ? (
                    <Button size="sm" variant="primary" onClick={() => setActiveShip(ship.id)}>
                      Take command
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={check.ok ? "primary" : "secondary"}
                      disabled={!check.ok}
                      title={check.ok ? undefined : check.message}
                      onClick={() => {
                        const r = buyShip(ship.id);
                        if (r.ok) {
                          setActiveShip(ship.id);
                          toast(`The ${ship.name} is yours. Welcome aboard, captain!`, "reward");
                        } else toast(r.message, "warning");
                      }}
                    >
                      {check.ok ? "Buy" : check.reason === "level" ? `Level ${ship.levelRequired}` : "Not enough"}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const KINDS: { kind: PartKind; label: string }[] = [
  { kind: "sails", label: "Sails" },
  { kind: "figurehead", label: "Figureheads" },
  { kind: "flag", label: "Flags" },
  { kind: "desk", label: "Desks" },
];

function Parts() {
  const inventory = useEconomy((s) => s.inventory);
  const doubloons = useEconomy((s) => s.doubloons);
  const xp = useEconomy((s) => s.xp);
  const buyPart = useEconomy((s) => s.buyPart);
  const custom = useCustomizer();
  const toast = useUi((s) => s.toast);
  const { ship, loadout } = resolveActiveShip(custom, inventory);
  const wallet = { doubloons, level: levelForXp(xp), inventory };

  const action = (kind: PartKind, item: CatalogItem) => {
    const equipped = loadout[kind] === item.id;
    const owned = ownsPart(inventory, kind, item.id, ship);
    if (equipped) return <Badge tone="brass">Fitted</Badge>;
    if (owned)
      return (
        <Button size="sm" onClick={() => custom.equip(kind, item.id)}>
          Fit
        </Button>
      );
    if (item.source === "quest") return <Badge tone="navy">Crew quest reward</Badge>;
    const check = checkPartPurchase(kind, item.id, wallet);
    return (
      <Button
        size="sm"
        variant={check.ok ? "primary" : "secondary"}
        disabled={!check.ok}
        title={check.ok ? undefined : check.message}
        onClick={() => {
          const r = buyPart(kind, item.id);
          if (r.ok) {
            custom.equip(kind, item.id);
            toast(`${getPart(kind, item.id)?.name} fitted to the ${ship.name}.`, "reward");
          } else toast(r.message, "warning");
        }}
      >
        <Price amount={item.price} />
        {!check.ok && check.reason === "level" ? ` · Lv ${item.levelRequired}` : ""}
      </Button>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="lg:sticky lg:top-0 lg:self-start">
        <KawaiiShipPreview
          ship={ship}
          loadout={loadout}
          width={360}
          height={225}
          className="block rounded-3xl border border-[#A29C93]/50 shadow-[3px_3px_0_#EAE5DA]"
        />
        <p className="mt-2 font-serif text-lg font-bold text-[#5D564E]">{ship.name}</p>
        <p className="font-serif text-sm text-[#8E887F]">Parts you buy can go on any ship they fit. Each ship's own parts come with it.</p>
      </div>
      <div className="space-y-4">
        {KINDS.map(({ kind, label }) => {
          const items = partsForShip(ship, kind);
          return (
            <section key={kind}>
              <h3 className="mb-1.5 font-serif font-bold text-[#5D564E]">{label}</h3>
              {items.length <= 1 && kind !== "flag" && kind !== "desk" ? (
                <p className="font-serif text-sm text-[#8E887F]">The {ship.name} has nowhere to fit {label.toLowerCase()}.</p>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className={cx(
                        "flex items-center gap-2 rounded-2xl border bg-[#FFFDF7] px-3 py-2 font-serif shadow-[2px_2px_0_#EAE5DA]",
                        loadout[kind] === item.id ? "border-[#C9A66B] bg-[#FFFBF0]" : "border-[#A29C93]/40",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#5D564E]">{item.name}</p>
                        <p className="truncate text-xs text-[#8E887F]">{item.description}</p>
                      </div>
                      {action(kind, item)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
