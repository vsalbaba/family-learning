import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPackageDetail, getSubjectDetail } from "../api/auth";
import type { ProgressDetail, ProgressDetailWrongAnswer } from "../api/auth";

const ACTIVITY_LABELS: Record<string, string> = {
  flashcard: "Kartička",
  multiple_choice: "Výběr z možností",
  true_false: "Pravda/Nepravda",
  fill_in: "Doplňování",
  matching: "Přiřazování",
  ordering: "Řazení",
  math_input: "Číslo",
};

const MASTERY_LABELS: Record<string, string> = {
  unknown: "Nové",
  learning: "Učí se",
  known: "Umí",
  review: "Opakovat",
};

export default function ProgressDetailPage() {
  const { childId, packageId, subject } = useParams<{
    childId: string;
    packageId?: string;
    subject?: string;
  }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ProgressDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemsExpanded, setItemsExpanded] = useState(false);

  useEffect(() => {
    if (!childId) return;
    const cid = Number(childId);
    const fetcher = packageId
      ? getPackageDetail(cid, Number(packageId))
      : getSubjectDetail(cid, subject!);
    fetcher
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [childId, packageId, subject]);

  const backUrl = `/children/${childId}/progress`;

  if (loading) return <p>Načítání...</p>;
  if (error) return <p className="lesson-error">{error}</p>;
  if (!detail) return <p>Data nenalezena.</p>;

  const { mastery_counts: mc } = detail;

  return (
    <div className="page progress-page">
      <div className="page-header">
        <h2>{detail.title}</h2>
        <button className="btn btn-secondary" onClick={() => navigate(backUrl)}>
          Zpět
        </button>
      </div>

      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 0.75rem" }}>
        Celkem odpovědí: {detail.total_answers}
      </p>

      <div className="mastery-cards">
        <div className="mastery-card mastery-card--unknown">
          <div className="mastery-value">{mc.unknown}</div>
          <div className="mastery-label">Nové</div>
        </div>
        <div className="mastery-card mastery-card--learning">
          <div className="mastery-value">{mc.learning}</div>
          <div className="mastery-label">Učí se</div>
        </div>
        <div className="mastery-card mastery-card--known">
          <div className="mastery-value">{mc.known}</div>
          <div className="mastery-label">Umí</div>
        </div>
        <div className="mastery-card mastery-card--review">
          <div className="mastery-value">{mc.review}</div>
          <div className="mastery-label">Opakovat</div>
        </div>
      </div>

      {detail.recent_wrong.length > 0 && (
        <>
          <h3>Poslední chyby</h3>
          <div className="weak-questions-list">
            {detail.recent_wrong.map((w, i) => (
              <RecentWrongCard key={i} w={w} showPackage={detail.scope_type === "subject"} />
            ))}
          </div>
        </>
      )}

      <button className="detail-collapse-toggle" onClick={() => setItemsExpanded((v) => !v)}>
        {itemsExpanded ? "Skrýt otázky" : `Zobrazit všechny otázky (${detail.items.length})`}
      </button>

      {itemsExpanded && (
        <div className="progress-table-wrap" style={{ marginTop: "0.5rem" }}>
          <table className="progress-table">
            <thead>
              <tr>
                <th>Otázka</th>
                {detail.scope_type === "subject" && <th>Balíček</th>}
                <th>Typ</th>
                <th>Odpovědí</th>
                <th>Správně</th>
                <th>Špatně</th>
                <th>Procvičenost</th>
                <th>Naposledy</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((it) => (
                <tr key={it.item_id}>
                  <td>{it.question}</td>
                  {detail.scope_type === "subject" && <td>{it.package_name}</td>}
                  <td>{ACTIVITY_LABELS[it.activity_type] || it.activity_type}</td>
                  <td>{it.answer_count}</td>
                  <td>{it.correct_count}</td>
                  <td>{it.wrong_count}</td>
                  <td>
                    <span className={`mastery-badge mastery-badge--${it.mastery}`}>
                      {MASTERY_LABELS[it.mastery] || it.mastery}
                    </span>
                  </td>
                  <td>{formatDate(it.last_answered_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecentWrongCard({ w, showPackage }: { w: ProgressDetailWrongAnswer; showPackage: boolean }) {
  return (
    <div className="weak-question-card">
      <div className="weak-question-header">
        <span className="tag">
          {ACTIVITY_LABELS[w.activity_type] || w.activity_type}
        </span>
        {showPackage && <span className="weak-question-pkg">{w.package_name}</span>}
      </div>
      <div className="weak-question-text">{w.question}</div>
      <div className="weak-question-correct">
        Správná odpověď: <strong>{formatAnswerData(w.correct_answer_data, w.activity_type)}</strong>
      </div>
      <div style={{ fontSize: "0.85rem", color: "#991b1b", marginTop: "0.25rem" }}>
        Odpověď žáka: {formatAnswerData(w.given_answer_data, w.activity_type)}
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
        {formatDate(w.answered_at)}
      </div>
    </div>
  );
}

function formatAnswerData(data: unknown, activityType: string): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  const p = data as Record<string, unknown>;
  if (activityType === "multiple_choice") {
    const selText = p.selected_text as string | undefined;
    if (selText) return selText;
    const opts = p.options as string[] | undefined;
    const idx = p.correct as number | undefined;
    if (opts && idx !== undefined) return opts[idx] || `Možnost ${idx}`;
    const sel = p.selected as number | undefined;
    if (sel !== undefined) return `Možnost ${sel}`;
    return JSON.stringify(data);
  }
  if (activityType === "true_false") {
    const val = p.correct ?? p.answer;
    return val ? "Pravda" : "Nepravda";
  }
  if (activityType === "fill_in") {
    const accepted = p.accepted_answers as string[] | undefined;
    if (accepted) return accepted.join(", ");
    const text = p.text as string | undefined;
    if (text) return text;
    return JSON.stringify(data);
  }
  if (activityType === "matching" && p.pairs) {
    return (p.pairs as { left: string; right: string }[])
      .map((pr) => `${pr.left}→${pr.right}`)
      .join(", ");
  }
  if (activityType === "ordering") {
    const order = (p.correct_order || p.order) as string[] | undefined;
    if (order) return order.join(" → ");
    return JSON.stringify(data);
  }
  if (activityType === "math_input") {
    const val = p.correct_value ?? p.value;
    if (val !== undefined) return String(val) + (p.unit ? ` ${p.unit}` : "");
    return JSON.stringify(data);
  }
  if (activityType === "flashcard") {
    return (p.answer as string) || "Nevěděl/a";
  }
  return JSON.stringify(data);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("cs-CZ");
}
