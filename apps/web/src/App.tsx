import { useEffect } from "react";
import { useAmbiance } from "./hooks/useAmbiance.js";
import { useAutoSync } from "./hooks/useAutoSync.js";
import { useCrewSync } from "./hooks/useCrewSync.js";
import { useIdleDetection } from "./hooks/useIdleDetection.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { useLookoutBridge } from "./hooks/useLookoutBridge.js";
import { useVoyageTicker } from "./hooks/useVoyageTicker.js";
import { useWebRTC } from "./hooks/useWebRTC.js";
import { BreakReflectModal } from "./components/BreakReflectModal.js";
import { Hud } from "./components/Hud.js";
import { PanelHost } from "./components/PanelHost.js";
import { StudyMaterialsSection } from "./components/StudyMaterialsSection.js";
import { ShipCanvas } from "./ship-engine/ShipCanvas.js";
import { useSettings } from "./stores/settingsStore.js";

export function App() {
  const visualStyle = useSettings((s) => s.visualStyle);
  useEffect(() => {
    document.documentElement.dataset.visualStyle = visualStyle;
  }, [visualStyle]);
  useVoyageTicker();
  useIdleDetection();
  useKeyboard();
  useAmbiance();
  useLookoutBridge();
  useAutoSync();
  useCrewSync();
  useWebRTC();
  return (
    <div id="top" className="min-h-screen w-full bg-[var(--page-bg)]">
      <div className="relative h-screen min-h-[580px] w-full overflow-hidden">
        <ShipCanvas />
        <Hud />
      </div>
      <StudyMaterialsSection />
      <PanelHost />
      <BreakReflectModal />
    </div>
  );
}
