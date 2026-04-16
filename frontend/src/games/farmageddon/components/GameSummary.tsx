import type { GameSummary as Summary } from "../types";

interface Props {
  summary: Summary;
  onRetry: () => void;
  onBack: () => void;
  canReplay: boolean;
}

export default function GameSummary({ summary, onRetry, onBack, canReplay }: Props) {
  const isWin = summary.result === "won";

  return (
    <div className="fg-summary-overlay">
      <div className={`fg-summary ${isWin ? "fg-summary--win" : "fg-summary--lose"}`}>
        <h2 className="fg-summary-title">
          {isWin ? "Výhra!" : "Prohra!"}
        </h2>

        <div className="fg-summary-stats">
          <div className="fg-stat">
            <span className="fg-stat-icon">🥚</span>
            <span className="fg-stat-value">{summary.eggsCollected}</span>
            <span className="fg-stat-label">vajec sebráno</span>
          </div>
          <div className="fg-stat">
            <span className="fg-stat-icon">👹</span>
            <span className="fg-stat-value">{summary.goblinsKilled}</span>
            <span className="fg-stat-label">goblinů zabito</span>
          </div>
          <div className="fg-stat">
            <span className="fg-stat-icon">💀</span>
            <span className="fg-stat-value">{summary.animalsLost}</span>
            <span className="fg-stat-label">zvířat ztraceno</span>
          </div>
        </div>

        <div className="fg-summary-actions">
          {canReplay ? (
            <button className="btn btn-primary" onClick={onRetry}>
              Znovu
            </button>
          ) : (
            <p className="game-window-expired">Herní čas vypršel</p>
          )}
          <button className="btn btn-secondary" onClick={onBack}>
            Zpět
          </button>
        </div>
      </div>
    </div>
  );
}
