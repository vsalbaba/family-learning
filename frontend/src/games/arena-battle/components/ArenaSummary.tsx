import type { ArenaSummary as ArenaSummaryData } from "../types";

interface Props {
  summary: ArenaSummaryData;
  canReplay: boolean;
  onReplay: () => void;
  onBack: () => void;
}

export default function ArenaSummary({
  summary,
  canReplay,
  onReplay,
  onBack,
}: Props) {
  const { stats } = summary;

  return (
    <div className="arena-summary-overlay">
      <div className="arena-summary">
        <h2>{summary.result === "won" ? "Výhra!" : "Prohra!"}</h2>
        <div className="arena-summary-stats">
          <p>
            Easy: {stats.easyCorrect}/{stats.easyAnswered} správně
          </p>
          <p>
            Hard: {stats.hardCorrect}/{stats.hardAnswered} správně
          </p>
          <p>Zabito nepřátel: {stats.enemiesKilled}</p>
          <p>Vysláno jednotek: {stats.unitsSpawned}</p>
        </div>
        <div className="arena-summary-actions">
          {canReplay && (
            <button className="btn btn-primary" onClick={onReplay}>
              Znovu
            </button>
          )}
          <button className="btn btn-secondary" onClick={onBack}>
            Zpět
          </button>
        </div>
      </div>
    </div>
  );
}
