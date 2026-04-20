import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useGameWindow } from "../../../hooks/useGameWindow";
import { DEFAULT_CONFIG } from "../config";
import { useArenaGame } from "../hooks/useArenaGame";
import ArenaBoard from "./ArenaBoard";
import ArenaSummary from "./ArenaSummary";
import QuestionPanel from "./QuestionPanel";

export default function ArenaGame() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isActive: windowActive } = useGameWindow();
  const config = DEFAULT_CONFIG;

  const { view, handleAnswer, restart } = useArenaGame(canvasRef, config);

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
          canReplay={windowActive}
          onReplay={restart}
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
