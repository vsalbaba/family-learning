import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getChildProgress, getDailyActivity, getSubjectDailyDetail } from "../api/auth";
import type { ChildProgress, WeakQuestion, DailyActivity, SubjectDailyDetail } from "../api/auth";

const ACTIVITY_LABELS: Record<string, string> = {
  flashcard: "Kartička",
  multiple_choice: "Výběr z možností",
  true_false: "Pravda/Nepravda",
  fill_in: "Doplňování",
  matching: "Přiřazování",
  ordering: "Řazení",
  math_input: "Číslo",
};

type ActivityFilter = "today" | "yesterday" | "week" | "month";

const FILTER_LABELS: Record<ActivityFilter, string> = {
  today: "Dnes",
  yesterday: "Včera",
  week: "Tento týden",
  month: "Tento měsíc",
};

function getFilterDates(filter: ActivityFilter): { date?: string; fromDate?: string; toDate?: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (filter) {
    case "today":
      return { date: fmt(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { date: fmt(y) };
    }
    case "week": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      return { fromDate: fmt(monday), toDate: fmt(now) };
    }
    case "month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { fromDate: fmt(first), toDate: fmt(now) };
    }
  }
}

export default function ChildProgressPage() {
  const { childId } = useParams<{ childId: string }>();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<ChildProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activity, setActivity] = useState<DailyActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>("today");
  const [expandedDetail, setExpandedDetail] = useState<{
    subjectSlug: string;
    data: SubjectDailyDetail | null;
    error?: boolean;
  } | null>(null);

  useEffect(() => {
    if (childId) {
      getChildProgress(Number(childId))
        .then(setProgress)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [childId]);

  useEffect(() => {
    if (!childId) return;
    setActivityLoading(true);
    setExpandedDetail(null);
    getDailyActivity(Number(childId), getFilterDates(activeFilter))
      .then(setActivity)
      .catch(() => setActivity(null))
      .finally(() => setActivityLoading(false));
  }, [childId, activeFilter]);

  function toggleSubjectDetail(subjectSlug: string) {
    if (expandedDetail?.subjectSlug === subjectSlug) {
      setExpandedDetail(null);
      return;
    }
    setExpandedDetail({ subjectSlug, data: null });
    getSubjectDailyDetail(Number(childId!), subjectSlug, getFilterDates(activeFilter))
      .then((detail) => setExpandedDetail({ subjectSlug, data: detail }))
      .catch(() => setExpandedDetail({ subjectSlug, data: null, error: true }));
  }

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

      <div className="progress-activity-filters">
        {(Object.keys(FILTER_LABELS) as ActivityFilter[]).map((key) => (
          <button
            key={key}
            className={`progress-activity-filter${activeFilter === key ? " progress-activity-filter--active" : ""}`}
            onClick={() => setActiveFilter(key)}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="progress-activity-ticker">
        {activityLoading ? (
          <span className="progress-activity-loading">Načítání...</span>
        ) : !activity || activity.total_tasks === 0 ? (
          <span className="progress-activity-empty">
            {FILTER_LABELS[activeFilter]}: zatím bez aktivity
          </span>
        ) : (
          <>
            <span className="progress-activity-total">
              {activity.total_tasks} úkolů:
            </span>
            {activity.subjects.map((s) => (
              <button
                key={s.subject_slug}
                className={`progress-subject-pill${
                  expandedDetail?.subjectSlug === s.subject_slug
                    ? " progress-subject-pill--active" : ""
                }`}
                onClick={() => toggleSubjectDetail(s.subject_slug)}
              >
                {s.subject_name} {s.task_count}
              </button>
            ))}
          </>
        )}
      </div>

      {expandedDetail && (
        <div className="progress-activity-detail">
          {expandedDetail.error ? (
            <span className="progress-activity-error">
              Nepodařilo se načíst detail.{" "}
              <button className="btn-link" onClick={() => toggleSubjectDetail(expandedDetail.subjectSlug)}>
                Zkusit znovu
              </button>
            </span>
          ) : expandedDetail.data === null ? (
            <span className="progress-activity-loading">Načítání...</span>
          ) : expandedDetail.data.packages.length === 0 ? (
            <span className="progress-activity-empty">Žádná aktivita v tomto předmětu</span>
          ) : (
            expandedDetail.data.packages.map((pkg) => (
              <div key={pkg.package_id} className="progress-pkg-row">
                <span className="progress-pkg-name">{pkg.package_name}</span>
                <span className="progress-pkg-stats">
                  {pkg.task_count} úkolů · {pkg.correct_count} správně · {pkg.wrong_count} špatně
                </span>
              </div>
            ))
          )}
        </div>
      )}

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
                  <tr
                    key={p.package_id}
                    className="progress-table-row--clickable"
                    onClick={() => navigate(`/children/${childId}/progress/package/${p.package_id}`)}
                  >
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
                      <tr
                        key={s.subject_slug}
                        className="progress-table-row--clickable"
                        onClick={() => navigate(`/children/${childId}/progress/subject/${encodeURIComponent(s.subject_slug)}`)}
                      >
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
