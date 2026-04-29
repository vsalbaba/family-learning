import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_CONFIG } from "../config";
import { useArenaGame } from "../hooks/useArenaGame";
import { submitArenaResult, type ArenaResultResponse } from "../../../api/rewards";
import { getGameProgress, updateGameProgress } from "../../../api/gameProgress";
import { useAuth } from "../../../contexts/AuthContext";
import ArenaBoard from "./ArenaBoard";
import ArenaSummary from "./ArenaSummary";
import QuestionPanel from "./QuestionPanel";

export default function ArenaGame() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { updateRewardState } = useAuth();
  const config = DEFAULT_CONFIG;

  const { view, handleAnswer, restart } = useArenaGame(canvasRef, config);
  const [reward, setReward] = useState<ArenaResultResponse | null>(null);
  const submittedRef = useRef(false);
  const currentXpRef = useRef(0);

  useEffect(() => {
    getGameProgress("arena-battle").then((p) => { currentXpRef.current = p.xp; }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!view.summary || submittedRef.current) return;
    submittedRef.current = true;
    const { stats } = view.summary;
    const correct = stats.easyCorrect + stats.hardCorrect;
    if (correct > 0) {
      submitArenaResult(correct).then((r) => {
        setReward(r);
        updateRewardState({ progress: r.progress, streak: 0, game_tokens: r.game_tokens });
      });
    }
    const xpDelta = stats.easyCorrect * 5 + stats.hardCorrect * 10 + stats.enemiesKilled * 2;
    if (xpDelta > 0) {
      const newXp = currentXpRef.current + xpDelta;
      const level = arenaLevel(newXp);
      updateGameProgress("arena-battle", {
        xpDelta,
        dataPatch: {
          totalCorrect: (stats.easyCorrect + stats.hardCorrect),
          totalKills: stats.enemiesKilled,
          lastResult: view.summary.result,
        },
        summary: {
          level,
          label: `Liga ${level || 1}`,
          progressText: `${newXp} XP`,
          progressPercent: Math.round(((newXp % 50) / 50) * 100),
        },
      }).catch(() => {});
    }
  }, [view.summary, updateRewardState]);

  function handleRestart() {
    submittedRef.current = false;
    setReward(null);
    restart();
  }

  return (
    <div className="arena-game">
      <div className="arena-header">
        <span className="arena-timer">⏱ {formatTime(view.remainingSeconds)}</span>
        <span className="arena-score">Zabito: {view.stats.enemiesKilled}</span>
      </div>

      <ArenaBoard ref={canvasRef} config={config} />

      <QuestionPanel
        config={config.question}
        gameActive={view.phase === "playing"}
        onAnswer={handleAnswer}
      />

      {view.summary && (
        <ArenaSummary
          summary={view.summary}
          reward={reward}
          onReplay={handleRestart}
          onBack={() => navigate("/")}
        />
      )}

      <button
        className="btn btn-secondary btn-end-game"
        onClick={() => navigate("/")}
      >
        Ukončit hru
      </button>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function arenaLevel(xp: number): number {
  return Math.floor(xp / 50);
}
