import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPackageDetail, getSubjectDetail } from "../api/auth";
import type { ProgressDetail, ProgressDetailWrongAnswer } from "../api/auth";
import { deleteItem, getItem, updateItem } from "../api/packages";
import type { PackageItem } from "../types/package";
import type { ActivityType } from "../types/package";
import ItemEditor from "../components/packages/ItemEditor";

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
  const [editingItem, setEditingItem] = useState<{ itemId: number; packageId: number; data: PackageItem } | null>(null);
  const [editLoading, setEditLoading] = useState<number | null>(null);

  async function handleEditItem(itemId: number, packageId: number) {
    setEditLoading(itemId);
    try {
      const data = await getItem(itemId);
      setEditingItem({ itemId, packageId, data });
    } catch (e) {
      alert(`Chyba při načítání: ${e instanceof Error ? e.message : "Neznámá chyba"}`);
    } finally {
      setEditLoading(null);
    }
  }

  async function handleSaveItem(data: Record<string, unknown>) {
    if (!editingItem) return;
    try {
      await updateItem(editingItem.packageId, editingItem.itemId, data);
      setEditingItem(null);
      loadDetail();
    } catch (e) {
      alert(`Chyba při ukládání: ${e instanceof Error ? e.message : "Neznámá chyba"}`);
    }
  }

  const loadDetail = useCallback(() => {
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

  useEffect(() => { loadDetail(); }, [loadDetail]);

  async function handleDeleteItem(itemId: number, pkgId: number, question: string) {
    if (!confirm(`Smazat otázku "${question}"?`)) return;
    try {
      await deleteItem(pkgId, itemId);
      loadDetail();
    } catch (e) {
      alert(`Chyba při mazání: ${e instanceof Error ? e.message : "Neznámá chyba"}`);
    }
  }

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
              <RecentWrongCard key={i} w={w} showPackage={detail.scope_type === "subject"}
                editingItem={editingItem?.itemId === w.item_id ? editingItem : null}
                editLoading={editLoading === w.item_id}
                onPreview={() => navigate(`/packages/${w.package_id}/preview?item=${w.item_id}`)}
                onEdit={() => handleEditItem(w.item_id, w.package_id)}
                onSave={handleSaveItem}
                onCancelEdit={() => setEditingItem(null)}
                onDelete={() => handleDeleteItem(w.item_id, w.package_id, w.question)} />
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
                <th>Akce</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((it) => (
                <tr key={it.item_id}>
                  {editingItem?.itemId === it.item_id ? (
                    <td colSpan={detail.scope_type === "subject" ? 9 : 8}>
                      <ItemEditor
                        item={editingItem.data}
                        activityType={editingItem.data.activity_type as ActivityType}
                        onSave={handleSaveItem}
                        onCancel={() => setEditingItem(null)}
                      />
                    </td>
                  ) : (
                    <>
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
                      <td className="item-actions">
                        <button className="btn btn-small btn-primary"
                          onClick={() => navigate(`/packages/${it.package_id}/preview?item=${it.item_id}`)}>
                          Vyzkoušet
                        </button>
                        <button className="btn btn-small btn-secondary"
                          disabled={editLoading === it.item_id}
                          onClick={() => handleEditItem(it.item_id, it.package_id)}>
                          {editLoading === it.item_id ? "..." : "Upravit"}
                        </button>
                        <button className="btn btn-small btn-danger"
                          onClick={() => handleDeleteItem(it.item_id, it.package_id, it.question)}>
                          Smazat
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecentWrongCard({ w, showPackage, editingItem, editLoading, onPreview, onEdit, onSave, onCancelEdit, onDelete }: {
  w: ProgressDetailWrongAnswer;
  showPackage: boolean;
  editingItem: { itemId: number; packageId: number; data: PackageItem } | null;
  editLoading: boolean;
  onPreview: () => void;
  onEdit: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="weak-question-card">
      {editingItem ? (
        <ItemEditor
          item={editingItem.data}
          activityType={editingItem.data.activity_type as ActivityType}
          onSave={onSave}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
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
          <div className="item-actions" style={{ marginTop: "0.5rem" }}>
            <button className="btn btn-small btn-primary" onClick={onPreview}>Vyzkoušet</button>
            <button className="btn btn-small btn-secondary" disabled={editLoading} onClick={onEdit}>
              {editLoading ? "..." : "Upravit"}
            </button>
            <button className="btn btn-small btn-danger" onClick={onDelete}>Smazat</button>
          </div>
        </>
      )}
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
