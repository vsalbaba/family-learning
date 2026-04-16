import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getChildProgress } from "../api/auth";
import type { ChildProgress, WeakQuestion } from "../api/auth";

const ACTIVITY_LABELS: Record<string, string> = {
  flashcard: "Kartička",
  multiple_choice: "Výběr z možností",
  true_false: "Pravda/Nepravda",
  fill_in: "Doplňování",
  matching: "Přiřazování",
  ordering: "Řazení",
  math_input: "Číslo",
};

export default function ChildProgressPage() {
  const { childId } = useParams<{ childId: string }>();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<ChildProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (childId) {
      getChildProgress(Number(childId))
        .then(setProgress)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [childId]);

  if (loading) return <p>Načítání...</p>;
  if (error) return <p className="lesson-error">{error}</p>;
  if (!progress) return <p>Data nenalezena.</p>;

  return (
    <div className="page progress-page">
      <div className="page-header">
        <h2>Přehled: {progress.child_name}</h2>
        <button className="btn btn-secondary" onClick={() => navigate("/children")}>
          Zpět
        </button>
      </div>

      <div className="progress-summary-cards">
        <div className="stat-card">
          <div className="stat-value">{progress.total_sessions}</div>
          <div className="stat-label">Dokončených lekcí</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {progress.total_correct}/{progress.total_questions}
          </div>
          <div className="stat-label">Správných odpovědí</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{progress.overall_avg_pct}%</div>
          <div className="stat-label">Průměrná úspěšnost</div>
        </div>
      </div>

      {progress.total_sessions === 0 ? (
        <div className="empty-state">
          <p>Zatím žádné dokončené lekce.</p>
        </div>
      ) : (
        <>
          <h3>Balíčky</h3>
          <div className="progress-table-wrap">
            <table className="progress-table">
              <thead>
                <tr>
                  <th>Balíček</th>
                  <th>Předmět</th>
                  <th>Lekcí</th>
                  <th>Průměr</th>
                  <th>Nejlepší</th>
                  <th>Naposledy</th>
                </tr>
              </thead>
              <tbody>
                {progress.packages.map((p) => (
                  <tr key={p.package_id}>
                    <td>{p.package_name}</td>
                    <td>{p.subject || "—"}</td>
                    <td>{p.session_count}</td>
                    <td>
                      <span className={scoreBadgeClass(p.avg_score_pct)}>
                        {p.avg_score_pct}%
                      </span>
                    </td>
                    <td>
                      <span className={scoreBadgeClass(p.best_score_pct)}>
                        {p.best_score_pct}%
                      </span>
                    </td>
                    <td>{formatDate(p.last_played)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {progress.subject_progress?.length > 0 && (
            <>
              <h3>Předměty</h3>
              <div className="progress-table-wrap">
                <table className="progress-table">
                  <thead>
                    <tr>
                      <th>Předmět</th>
                      <th>Lekcí</th>
                      <th>Průměr</th>
                      <th>Nejlepší</th>
                      <th>Naposledy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.subject_progress.map((s) => (
                      <tr key={s.subject}>
                        <td>{s.subject}</td>
                        <td>{s.session_count}</td>
                        <td>
                          <span className={scoreBadgeClass(s.avg_score_pct)}>
                            {s.avg_score_pct}%
                          </span>
                        </td>
                        <td>
                          <span className={scoreBadgeClass(s.best_score_pct)}>
                            {s.best_score_pct}%
                          </span>
                        </td>
                        <td>{formatDate(s.last_played)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {progress.weak_questions.length > 0 && (
            <>
              <h3>Nejslabší otázky</h3>
              <div className="weak-questions-list">
                {progress.weak_questions.map((q) => (
                  <div key={q.item_id} className="weak-question-card">
                    <div className="weak-question-header">
                      <span className="tag">
                        {ACTIVITY_LABELS[q.activity_type] || q.activity_type}
                      </span>
                      <span className="weak-question-pkg">{q.package_name}</span>
                    </div>
                    <div className="weak-question-text">{q.question}</div>
                    <div className="weak-question-stats">
                      <span className="score-badge score-badge--bad">
                        {q.error_rate_pct}% chyb
                      </span>
                      <span className="weak-question-attempts">
                        ({q.wrong_count} z {q.total_attempts} pokusů)
                      </span>
                    </div>
                    <div className="weak-question-correct">
                      Správná odpověď: <strong>{formatCorrectAnswer(q)}</strong>
                    </div>
                    {q.wrong_answers.length > 0 && (
                      <div className="weak-question-wrong-list">
                        <span className="weak-question-wrong-label">Špatné odpovědi:</span>
                        {deduplicateAnswers(q).map((a, i) => (
                          <span key={i} className="weak-answer-chip">
                            {a.text}
                            {a.count > 1 && <span className="weak-answer-count">&times;{a.count}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function scoreBadgeClass(pct: number): string {
  if (pct >= 80) return "score-badge score-badge--good";
  if (pct >= 50) return "score-badge score-badge--ok";
  return "score-badge score-badge--bad";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("cs-CZ");
}

function formatGivenAnswer(json: string, activityType: string): string {
  try {
    const p = JSON.parse(json);
    if (activityType === "multiple_choice") return p.selected_text || `Možnost ${p.selected}`;
    if (activityType === "true_false") return p.answer ? "Pravda" : "Nepravda";
    if (activityType === "fill_in") return p.text || "";
    if (activityType === "matching" && p.pairs)
      return p.pairs.map((pr: { left: string; right: string }) => `${pr.left}→${pr.right}`).join(", ");
    if (activityType === "ordering" && p.order) return p.order.join(" → ");
    if (activityType === "math_input" && p.value !== undefined) return String(p.value);
    if (activityType === "flashcard") return "Nevěděl/a";
    return json;
  } catch {
    return json;
  }
}

function formatCorrectAnswer(q: WeakQuestion): string {
  try {
    const p = JSON.parse(q.correct_answer);
    if (q.activity_type === "multiple_choice") {
      const opts = p.options || [];
      const idx = p.correct ?? 0;
      return opts[idx] || `Možnost ${idx}`;
    }
    if (q.activity_type === "true_false") return p.correct ? "Pravda" : "Nepravda";
    if (q.activity_type === "fill_in") return (p.accepted_answers || []).join(", ");
    if (q.activity_type === "matching" && p.pairs)
      return p.pairs.map((pr: { left: string; right: string }) => `${pr.left}→${pr.right}`).join(", ");
    if (q.activity_type === "ordering" && p.correct_order) return p.correct_order.join(" → ");
    if (q.activity_type === "math_input") return String(p.correct_value) + (p.unit ? ` ${p.unit}` : "");
    if (q.activity_type === "flashcard") return p.answer || "";
    return "";
  } catch {
    return "";
  }
}

function deduplicateAnswers(q: WeakQuestion): { text: string; count: number }[] {
  const map = new Map<string, number>();
  for (const raw of q.wrong_answers) {
    const text = formatGivenAnswer(raw, q.activity_type);
    map.set(text, (map.get(text) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count);
}
