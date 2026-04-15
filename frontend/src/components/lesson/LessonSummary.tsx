import { useNavigate } from "react-router-dom";
import type { LessonSummary as SummaryType } from "../../types/lesson";

interface Props {
  summary: SummaryType;
  onRetry: () => void;
  onExtend?: () => void;
}

function formatCorrectAnswer(json: string, activityType: string): string {
  try {
    const p = JSON.parse(json);
    if (p.correct_text) return p.correct_text;
    if (p.answer) return p.answer;
    if (p.accepted_answers) return p.accepted_answers.join(", ");
    if (p.correct !== undefined)
      return activityType === "true_false"
        ? (p.correct ? "Pravda" : "Nepravda")
        : String(p.correct);
    if (p.correct_value !== undefined)
      return String(p.correct_value) + (p.unit ? ` ${p.unit}` : "");
    if (p.correct_order) return p.correct_order.join(" → ");
    if (p.pairs)
      return p.pairs
        .map((pair: { left: string; right: string }) => `${pair.left} → ${pair.right}`)
        .join(", ");
    return "";
  } catch {
    return json;
  }
}

export default function LessonSummaryView({ summary, onRetry, onExtend }: Props) {
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
        {summary.answers.map((a, i) => {
          const correct = formatCorrectAnswer(a.correct_answer, a.activity_type);
          return (
            <div
              key={i}
              className={`summary-answer summary-answer--${a.is_correct ? "correct" : "wrong"}`}
            >
              <span className="summary-icon">
                {a.is_correct ? "✓" : "✗"}
              </span>
              <span className="summary-question">
                {a.question}
                {correct && <span className="summary-correct"> ({correct})</span>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="summary-actions">
        {summary.can_extend && onExtend && (
          <button className="btn btn-primary" onClick={onExtend}>
            Dej mi ještě
          </button>
        )}
        <button
          className="btn btn-secondary"
          onClick={onRetry}
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
