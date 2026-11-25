import { useEffect } from "react";
import { useAmbiance } from "./hooks/useAmbiance.js";
import { useAutoSync } from "./hooks/useAutoSync.js";
import { useCloudSync } from "./hooks/useCloudSync.js";
import { useVaultSync } from "./hooks/useVaultSync.js";
import { useCrewSync } from "./hooks/useCrewSync.js";
import { useIdleDetection } from "./hooks/useIdleDetection.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { useLookoutBridge } from "./hooks/useLookoutBridge.js";
import { useRoomLink } from "./hooks/useRoomLink.js";
import { useRoomSync } from "./hooks/useRoomSync.js";
import { useVoyageTicker } from "./hooks/useVoyageTicker.js";
import { useWebRTC } from "./hooks/useWebRTC.js";
import { BreakReflectModal } from "./components/BreakReflectModal.js";
import { ConsentBanner, LegalFooter } from "./components/ConsentBanner.js";
import { Hud } from "./components/Hud.js";
import { MonthlyStatsModal } from "./components/MonthlyStatsModal.js";
import { PanelHost } from "./components/PanelHost.js";
import { StudyMaterialsSection } from "./components/StudyMaterialsSection.js";
import { SyncChoiceDialog } from "./components/SyncChoiceDialog.js";
import { ShipCanvas } from "./ship-engine/ShipCanvas.js";
import { applyThemeVariables, getKawaiiTheme } from "./ship-engine/kawaiiThemes.js";
import { useSettings } from "./stores/settingsStore.js";

export function App() {
  const visualStyle = useSettings((s) => s.visualStyle);
  const activeThemeId = useSettings((s) => s.activeThemeId);
  useEffect(() => {
    document.documentElement.dataset.visualStyle = visualStyle;
    applyThemeVariables(getKawaiiTheme(activeThemeId), visualStyle === "tiny-ink");
  }, [visualStyle, activeThemeId]);
  useVoyageTicker();
  useIdleDetection();
  useKeyboard();
  useAmbiance();
  useLookoutBridge();
  useAutoSync();
  useCloudSync();
  // Study Rooms on the website (Firestore); the localhost crew server below stays for npm run dev.
  useRoomLink();
  useRoomSync();
  useVaultSync();
  useCrewSync();
  useWebRTC();
  return (
    <div id="top" className="min-h-[100dvh] w-full bg-[var(--page-bg)]">
      <div className="relative h-[100dvh] min-h-[580px] w-full overflow-hidden">
        <ShipCanvas />
        <Hud />
      </div>
      <StudyMaterialsSection />
      <LegalFooter />
      <PanelHost />
      <BreakReflectModal />
      <MonthlyStatsModal />
      <SyncChoiceDialog />
      <ConsentBanner />
    </div>
  );
}
