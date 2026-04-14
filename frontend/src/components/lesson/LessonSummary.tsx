import { useNavigate } from "react-router-dom";
import type { LessonSummary as SummaryType } from "../../types/lesson";

interface Props {
  summary: SummaryType;
  packageId: number;
}

export default function LessonSummaryView({ summary, packageId }: Props) {
  const navigate = useNavigate();
  const emoji =
    summary.score_percent >= 80
      ? "🎉"
      : summary.score_percent >= 50
        ? "👍"
        : "💪";

  return (
    <div className="lesson-summary">
      <div className="summary-header">
        <span className="summary-emoji">{emoji}</span>
        <h2>
          {summary.correct_count} / {summary.total_questions}
        </h2>
        <p className="summary-score">{summary.score_percent} %</p>
      </div>

      <div className="summary-answers">
        {summary.answers.map((a, i) => (
          <div
            key={i}
            className={`summary-answer summary-answer--${a.is_correct ? "correct" : "wrong"}`}
          >
            <span className="summary-icon">
              {a.is_correct ? "✓" : "✗"}
            </span>
            <span className="summary-question">{a.question}</span>
          </div>
        ))}
      </div>

      <div className="summary-actions">
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/lesson/${packageId}`)}
        >
          Zkusit znovu
        </button>
        <button className="btn btn-secondary" onClick={() => navigate("/")}>
          Zpět
        </button>
      </div>
    </div>
  );
}
