// Shows whichever panel is open.

import { lazy, Suspense } from "react";
import { useUi } from "../stores/uiStore.js";
import { CaptainsLogPanel } from "./panels/CaptainsLogPanel.js";
import { CrewPanel } from "./panels/CrewPanel.js";
import { FlashcardsPanel } from "./panels/FlashcardsPanel.js";
import { FleetLogPanel } from "./panels/FleetLogPanel.js";
import { HelmPanel } from "./panels/HelmPanel.js";
import { LookoutPanel } from "./panels/LookoutPanel.js";
import { PlannerPanel } from "./panels/PlannerPanel.js";
import { SettingsPanel } from "./panels/SettingsPanel.js";
import { ShipwrightPanel } from "./panels/ShipwrightPanel.js";
import { WardrobePanel } from "./panels/WardrobePanel.js";

// The Note Nook brings the Markdown reader with it, so it loads the first time it opens.
const NoteNookPanel = lazy(() => import("./panels/NoteNookPanel.js").then((m) => ({ default: m.NoteNookPanel })));

export function PanelHost() {
  const panel = useUi((s) => s.panel);
  const close = () => useUi.getState().openPanel(null);
  switch (panel) {
    case "helm":
      return <HelmPanel onClose={close} />;
    case "planner":
      return <PlannerPanel onClose={close} />;
    case "log":
      return <CaptainsLogPanel onClose={close} />;
    case "notes":
      return (
        <Suspense fallback={null}>
          <NoteNookPanel onClose={close} />
        </Suspense>
      );
    case "flashcards":
      return <FlashcardsPanel onClose={close} />;
    case "shipwright":
      return <ShipwrightPanel onClose={close} />;
    case "wardrobe":
      return <WardrobePanel onClose={close} />;
    case "crew":
      return <CrewPanel onClose={close} />;
    case "fleet":
      return <FleetLogPanel onClose={close} />;
    case "lookout":
      return <LookoutPanel onClose={close} />;
    case "settings":
      return <SettingsPanel onClose={close} />;
    default:
      return null;
  }
}
