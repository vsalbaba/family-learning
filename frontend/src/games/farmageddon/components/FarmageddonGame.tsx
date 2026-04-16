import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { GameConfig, WaveConfig } from "../types";
import { DEFAULT_CONFIG, FALLBACK_WAVES } from "../config";
import { getWaveConfig } from "../../../api/farmageddon";
import { useGameLoop } from "../hooks/useGameLoop";
import GameBoard from "./GameBoard";
import Toolbar from "./Toolbar";
import WaveIndicator from "./WaveIndicator";
import GameSummary from "./GameSummary";

export default function FarmageddonGame() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [config, setConfig] = useState<GameConfig | null>(null);

  // Fetch wave config from backend, fallback to hardcoded
  useEffect(() => {
    let cancelled = false;
    getWaveConfig()
      .then((waves: WaveConfig[]) => {
        if (!cancelled) {
          setConfig({ ...DEFAULT_CONFIG, waves });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfig({ ...DEFAULT_CONFIG, waves: FALLBACK_WAVES });
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (!config) {
    return (
      <div className="fg-game">
        <p>Načítání...</p>
      </div>
    );
  }

  return <FarmageddonBoard config={config} canvasRef={canvasRef} navigate={navigate} />;
}

/** Inner component that only mounts once config is available. */
function FarmageddonBoard({
  config,
  canvasRef,
  navigate,
}: {
  config: GameConfig;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { view, setToolMode, restart } = useGameLoop(canvasRef, config);

  return (
    <div className="fg-game">
      <WaveIndicator
        currentWave={view.currentWave}
        totalWaves={view.totalWaves}
      />

      <GameBoard ref={canvasRef} config={config} />

      <Toolbar
        eggs={view.eggs}
        toolMode={view.toolMode}
        unitCosts={config.unitCosts}
        onSelectTool={setToolMode}
      />

      {view.summary && (
        <GameSummary
          summary={view.summary}
          onRetry={restart}
          onBack={() => navigate("/")}
        />
      )}
    </div>
  );
}
