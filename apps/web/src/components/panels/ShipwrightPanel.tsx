// The Shipwright: buy ships, switch between them, and buy or fit parts.

import { useState } from "react";
import { levelForXp } from "@ship/shared-types";
import type { PartKind, ShipCategory } from "@ship/shared-types";
import {
  SHIPS,
  SHIP_CATEGORIES,
  checkPartPurchase,
  checkShipPurchase,
  getPart,
  ownsPart,
  ownsShip,
  partsForShip,
} from "@ship/ship-theme-kit";
import type { CatalogItem } from "@ship/ship-theme-kit";
import { formatNumber } from "../../lib/format.js";
import { useEconomy } from "../../stores/economyStore.js";
import { resolveActiveShip, useCustomizer } from "../../stores/shipCustomizer.js";
import { useUi } from "../../stores/uiStore.js";
import { Doubloon, IconHammer } from "../icons.js";
import { ShipThumbnail } from "../ShipThumbnail.js";
import { Badge, Button, Panel, Tabs, cx } from "../ui.js";

type Tab = "ships" | "parts";

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
            className={cx("rounded-full border-2 px-3 py-1 font-display text-sm font-bold", category === c.id ? "border-ink bg-brass-400" : "border-ink/20 bg-cream-50 hover:border-ink/50")}
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
          return (
            <li key={ship.id} className={cx("overflow-hidden rounded-2xl border-2 bg-cream-50", active ? "border-brass-500 ring-3 ring-brass-300" : "border-ink/15")}>
              <ShipThumbnail ship={ship} width={340} height={190} fluid className="block" />
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display leading-tight font-extrabold">{ship.name}</h3>
                  {active ? <Badge tone="brass">Your ship</Badge> : owned ? <Badge tone="seafoam">Owned</Badge> : null}
                </div>
                <p className="mt-1 min-h-10 text-sm text-ink/70">{ship.tagline}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {owned ? (
                    <span className="text-sm text-ink/50">{ship.price ? "In your fleet" : "Free starter ship"}</span>
                  ) : (
                    <span className="text-sm font-bold">
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
        <ShipThumbnail ship={ship} loadout={loadout} width={360} height={225} fluid className="block rounded-2xl border-2 border-ink/20" />
        <p className="mt-2 font-display text-lg font-extrabold">{ship.name}</p>
        <p className="text-sm text-ink/60">Parts you buy can go on any ship they fit. Each ship's own parts come with it.</p>
      </div>
      <div className="space-y-4">
        {KINDS.map(({ kind, label }) => {
          const items = partsForShip(ship, kind);
          return (
            <section key={kind}>
              <h3 className="mb-1.5 font-display font-extrabold">{label}</h3>
              {items.length <= 1 && kind !== "flag" && kind !== "desk" ? (
                <p className="text-sm text-ink/60">The {ship.name} has nowhere to fit {label.toLowerCase()}.</p>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((item) => (
                    <li key={item.id} className={cx("flex items-center gap-2 rounded-xl border-2 bg-cream-50 px-3 py-2", loadout[kind] === item.id ? "border-brass-500" : "border-ink/10")}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{item.name}</p>
                        <p className="truncate text-xs text-ink/60">{item.description}</p>
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
