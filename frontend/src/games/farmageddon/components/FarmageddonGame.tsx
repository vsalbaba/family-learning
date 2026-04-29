import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { GameConfig, WaveConfig } from "../types";
import { DEFAULT_CONFIG, FALLBACK_WAVES } from "../config";
import { getWaveConfig } from "../../../api/farmageddon";
import { getGameProgress, updateGameProgress } from "../../../api/gameProgress";
import { useGameLoop } from "../hooks/useGameLoop";
import { useGameWindow } from "../../../hooks/useGameWindow";
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
function farmageddonLevel(xp: number): number {
  return Math.floor(xp / 80);
}

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
  const { isActive: canReplay } = useGameWindow();
  const submittedRef = useRef(false);
  const currentXpRef = useRef(0);

  useEffect(() => {
    getGameProgress("farmageddon").then((p) => { currentXpRef.current = p.xp; }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!view.summary || submittedRef.current) return;
    submittedRef.current = true;
    const s = view.summary;
    const xpDelta = s.goblinsKilled * 3 + s.wavesCompleted * 10 + (s.result === "won" ? 50 : 0);
    if (xpDelta > 0) {
      const newXp = currentXpRef.current + xpDelta;
      const level = farmageddonLevel(newXp);
      updateGameProgress("farmageddon", {
        xpDelta,
        dataPatch: {
          lastResult: s.result,
          bestWave: s.wavesCompleted,
          goblinsKilled: s.goblinsKilled,
        },
        summary: {
          level,
          label: `Lvl ${level || 1}`,
          progressText: `${newXp} XP`,
          progressPercent: Math.round(((newXp % 80) / 80) * 100),
        },
      }).catch(() => {});
    }
  }, [view.summary]);

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
          onRetry={() => { submittedRef.current = false; restart(); }}
          onBack={() => navigate("/")}
          canReplay={canReplay}
        />
      )}
    </div>
  );
}
