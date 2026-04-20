import type { ArenaResultResponse } from "../../../api/rewards";
import type { ArenaSummary as ArenaSummaryData } from "../types";

interface Props {
  summary: ArenaSummaryData;
  reward: ArenaResultResponse | null;
  onReplay: () => void;
  onBack: () => void;
}

export default function ArenaSummary({
  summary,
  reward,
  onReplay,
  onBack,
}: Props) {
  const { stats } = summary;
  const totalCorrect = stats.easyCorrect + stats.hardCorrect;

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
        {totalCorrect > 0 && (
          <div className="arena-summary-reward">
            <p>+{totalCorrect} % k odměně</p>
            {reward?.tokens_earned ? (
              <p className="arena-token-earned">
                +{reward.tokens_earned} žeton{reward.tokens_earned > 1 ? "y" : ""}!
              </p>
            ) : null}
          </div>
        )}
        <div className="arena-summary-actions">
          <button className="btn btn-primary" onClick={onReplay}>
            Znovu
          </button>
          <button className="btn btn-secondary" onClick={onBack}>
            Zpět
          </button>
        </div>
      </div>
    </div>
  );
}
