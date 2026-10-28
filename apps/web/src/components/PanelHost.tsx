// Shows whichever panel is open.

import { useUi } from "../stores/uiStore.js";
import { CaptainsLogPanel } from "./panels/CaptainsLogPanel.js";
import { CrewPanel } from "./panels/CrewPanel.js";
import { FlashcardsPanel } from "./panels/FlashcardsPanel.js";
import { FleetLogPanel } from "./panels/FleetLogPanel.js";
import { HelmPanel } from "./panels/HelmPanel.js";
import { LookoutPanel } from "./panels/LookoutPanel.js";
import { SettingsPanel } from "./panels/SettingsPanel.js";
import { ShipwrightPanel } from "./panels/ShipwrightPanel.js";
import { WardrobePanel } from "./panels/WardrobePanel.js";

export function PanelHost() {
  const panel = useUi((s) => s.panel);
  const close = () => useUi.getState().openPanel(null);
  switch (panel) {
    case "helm":
      return <HelmPanel onClose={close} />;
    case "log":
      return <CaptainsLogPanel onClose={close} />;
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
