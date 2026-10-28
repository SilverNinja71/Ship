import { useAmbiance } from "./hooks/useAmbiance.js";
import { useCrewSync } from "./hooks/useCrewSync.js";
import { useIdleDetection } from "./hooks/useIdleDetection.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { useLookoutBridge } from "./hooks/useLookoutBridge.js";
import { useVoyageTicker } from "./hooks/useVoyageTicker.js";
import { useWebRTC } from "./hooks/useWebRTC.js";
import { Hud } from "./components/Hud.js";
import { PanelHost } from "./components/PanelHost.js";
import { ShipCanvas } from "./ship-engine/ShipCanvas.js";

export function App() {
  useVoyageTicker();
  useIdleDetection();
  useKeyboard();
  useAmbiance();
  useLookoutBridge();
  useCrewSync();
  useWebRTC();
  return (
    <div className="relative h-full w-full overflow-hidden">
      <ShipCanvas />
      <Hud />
      <PanelHost />
    </div>
  );
}
