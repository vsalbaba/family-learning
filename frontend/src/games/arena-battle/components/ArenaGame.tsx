import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_CONFIG } from "../config";
import { useArenaGame } from "../hooks/useArenaGame";
import { submitArenaResult, type ArenaResultResponse } from "../../../api/rewards";
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

  useEffect(() => {
    if (!view.summary || submittedRef.current) return;
    submittedRef.current = true;
    const correct = view.summary.stats.easyCorrect + view.summary.stats.hardCorrect;
    if (correct > 0) {
      submitArenaResult(correct).then((r) => {
        setReward(r);
        updateRewardState({ progress: r.progress, streak: 0, game_tokens: r.game_tokens });
      });
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
