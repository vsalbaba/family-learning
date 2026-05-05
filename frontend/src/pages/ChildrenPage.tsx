import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  listChildren, createChild, updateChild,
  getDailyActivity, getSubjectDailyDetail,
} from "../api/auth";
import { listPackages } from "../api/packages";
import {
  createParentalReview,
  cancelParentalReview,
  listChildReviews,
} from "../api/parentalReviews";
import type { DailyActivity, SubjectDailyDetail } from "../api/auth";
import type { User } from "../types/user";
import type { PackageSummary } from "../types/package";
import type { ParentalReview, ParentalReviewCreate } from "../types/parentalReview";
import TokenIcon from "../components/common/TokenIcon";

export default function ChildrenPage() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [grade, setGrade] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", grade: "", pin: "" });

  const [activity, setActivity] = useState<Map<number, DailyActivity | null>>(new Map());
  const [expandedDetail, setExpandedDetail] = useState<{
    childId: number;
    subjectSlug: string;
    data: SubjectDailyDetail | null;
    error?: boolean;
  } | null>(null);

  // Parental reviews state
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [reviewsByChild, setReviewsByChild] = useState<Map<number, ParentalReview[]>>(new Map());
  const [showReviewForm, setShowReviewForm] = useState<number | null>(null);
  const [reviewForm, setReviewForm] = useState<{
    selectedPackageIds: number[];
    pendingPackageId: string;
    targetCredits: string;
    note: string;
  }>({ selectedPackageIds: [], pendingPackageId: "", targetCredits: "20", note: "" });

  useEffect(() => {
    listChildren()
      .then((kids) => {
        setChildren(kids);
        for (const kid of kids) {
          getDailyActivity(kid.id)
            .then((da) => setActivity((prev) => new Map(prev).set(kid.id, da)))
            .catch((err) => {
              console.error(`Failed to load activity for child ${kid.id}`, err);
              setActivity((prev) => {
                const next = new Map(prev);
                next.delete(kid.id);
                return next;
              });
            });
          listChildReviews(kid.id)
            .then((reviews) => setReviewsByChild((prev) => new Map(prev).set(kid.id, reviews)))
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
    listPackages()
      .then((pkgs) => setPackages(pkgs.filter((p) => p.status === "published")))
      .catch(() => {});
  }, []);

  async function handleAdd() {
    if (!name.trim() || !pin.trim()) return;
    const gradeNum = grade ? parseInt(grade) : undefined;
    const child = await createChild(name.trim(), pin.trim(), undefined, gradeNum);
    setChildren((c) => [...c, child]);
    setName("");
    setPin("");
    setGrade("");
  }

  function startEditing(child: User) {
    setEditForm({
      name: child.name,
      grade: child.grade != null ? String(child.grade) : "",
      pin: "",
    });
    setEditingId(child.id);
  }

  async function handleSaveEdit(childId: number) {
    const data: Record<string, unknown> = {};
    const child = children.find((c) => c.id === childId);
    if (!child) return;
    if (editForm.name.trim() && editForm.name.trim() !== child.name) {
      data.name = editForm.name.trim();
    }
    const newGrade = editForm.grade ? parseInt(editForm.grade) : 0;
    const currentGrade = child.grade ?? 0;
    if (newGrade !== currentGrade) {
      data.grade = newGrade;
    }
    if (editForm.pin.trim()) {
      data.pin = editForm.pin.trim();
    }
    if (Object.keys(data).length === 0) {
      setEditingId(null);
      return;
    }
    const updated = await updateChild(childId, data);
    setChildren((c) => c.map((ch) => (ch.id === childId ? updated : ch)));
    setEditingId(null);
  }

  function toggleSubjectDetail(childId: number, subjectSlug: string) {
    if (expandedDetail?.childId === childId && expandedDetail.subjectSlug === subjectSlug) {
      setExpandedDetail(null);
      return;
    }
    setExpandedDetail({ childId, subjectSlug, data: null });
    getSubjectDailyDetail(childId, subjectSlug)
      .then((detail) => setExpandedDetail({ childId, subjectSlug, data: detail }))
      .catch((err) => {
        console.error(`Failed to load subject detail`, err);
        setExpandedDetail({ childId, subjectSlug, data: null, error: true });
      });
  }

  function openReviewForm(childId: number) {
    setShowReviewForm(childId);
    setReviewForm({ selectedPackageIds: [], pendingPackageId: "", targetCredits: "20", note: "" });
  }

  function addPackageToReview() {
    const pkgId = parseInt(reviewForm.pendingPackageId);
    if (!pkgId || reviewForm.selectedPackageIds.includes(pkgId)) return;
    setReviewForm({
      ...reviewForm,
      selectedPackageIds: [...reviewForm.selectedPackageIds, pkgId],
      pendingPackageId: "",
    });
  }

  function removePackageFromReview(pkgId: number) {
    setReviewForm({
      ...reviewForm,
      selectedPackageIds: reviewForm.selectedPackageIds.filter((id) => id !== pkgId),
    });
  }

  async function handleCreateReview(childId: number) {
    if (reviewForm.selectedPackageIds.length === 0) return;
    const data: ParentalReviewCreate = {
      child_id: childId,
      package_ids: reviewForm.selectedPackageIds,
      target_credits: parseInt(reviewForm.targetCredits) || 20,
      note: reviewForm.note.trim() || null,
    };
    try {
      const review = await createParentalReview(data);
      setReviewsByChild((prev) => {
        const existing = prev.get(childId) ?? [];
        return new Map(prev).set(childId, [review, ...existing]);
      });
      setShowReviewForm(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Chyba při vytváření opakování");
    }
  }

  async function handleCancelReview(childId: number, reviewId: number) {
    if (!confirm("Zrušit toto opakování?")) return;
    try {
      const cancelled = await cancelParentalReview(reviewId);
      setReviewsByChild((prev) => {
        const existing = prev.get(childId) ?? [];
        return new Map(prev).set(childId, existing.map((r) => (r.id === reviewId ? cancelled : r)));
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Chyba při rušení opakování");
    }
  }

  return (
    <div className="page children-page">
      <div className="page-header">
        <h2>Správa dětí</h2>
        <button className="btn btn-secondary" onClick={() => navigate("/")}>
          Zpět
        </button>
      </div>

      <div className="children-list">
        {loading ? (
          <p>Načítání...</p>
        ) : children.length === 0 ? (
          <p>Zatím žádné děti. Přidejte první!</p>
        ) : (
          children.map((child) => (
            <div key={child.id} className="child-card">
              <div
                className="child-card__main child-card--clickable"
                onClick={() => navigate(`/children/${child.id}/progress`)}
              >
                <span>{child.avatar || "🧒"}</span>
                <span className="child-card__name">{child.name}</span>
                {child.grade != null && <span className="tag">{child.grade}. ročník</span>}
                <span className="child-card__tokens"><TokenIcon size={16} /> {child.game_tokens}</span>
                <button
                  className="btn btn-small btn-secondary child-card__add-token"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const updated = await updateChild(child.id, { game_tokens: child.game_tokens + 1 });
                    setChildren((c) => c.map((ch) => (ch.id === child.id ? updated : ch)));
                  }}
                >
                  +1
                </button>
                <span className="child-card__action">Přehled</span>
              </div>
              {activity.has(child.id) && (
                <div className="child-card__activity">
                  {activity.get(child.id) === null ? null : activity.get(child.id)!.total_tasks === 0 ? (
                    <span className="child-card__activity-empty">Dnes: zatím bez aktivity</span>
                  ) : (
                    <>
                      <span className="child-card__activity-label">Dnes:</span>
                      {activity.get(child.id)!.subjects.map((s) => (
                        <button
                          key={s.subject_slug}
                          className={`child-card__subject-pill${
                            expandedDetail?.childId === child.id && expandedDetail.subjectSlug === s.subject_slug
                              ? " child-card__subject-pill--active" : ""
                          }`}
                          onClick={(e) => { e.stopPropagation(); toggleSubjectDetail(child.id, s.subject_slug); }}
                        >
                          {s.subject_name} {s.task_count}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
              {expandedDetail?.childId === child.id && (
                <div className="child-card__activity-detail">
                  {expandedDetail.error ? (
                    <span className="child-card__activity-error">
                      Nepodařilo se načíst detail.{" "}
                      <button
                        className="btn-link"
                        onClick={() => toggleSubjectDetail(child.id, expandedDetail.subjectSlug)}
                      >
                        Zkusit znovu
                      </button>
                    </span>
                  ) : expandedDetail.data === null ? (
                    <span className="child-card__activity-loading">Načítání...</span>
                  ) : expandedDetail.data.packages.length === 0 ? (
                    <span className="child-card__activity-empty">Žádná aktivita v tomto předmětu</span>
                  ) : (
                    expandedDetail.data.packages.map((pkg) => (
                      <div key={pkg.package_id} className="child-card__pkg-row">
                        <span className="child-card__pkg-name">{pkg.package_name}</span>
                        <span className="child-card__pkg-stats">
                          {pkg.task_count} úkolů · {pkg.correct_count} správně · {pkg.wrong_count} špatně
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
              {editingId === child.id ? (
                <div className="child-card__edit-form">
                  <label>
                    Jméno
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </label>
                  <label>
                    Ročník
                    <input
                      type="number"
                      min="1"
                      max="13"
                      placeholder="—"
                      value={editForm.grade}
                      onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
                    />
                  </label>
                  <label>
                    Nový PIN
                    <input
                      type="text"
                      placeholder="ponechat stávající"
                      value={editForm.pin}
                      onChange={(e) => setEditForm({ ...editForm, pin: e.target.value })}
                      maxLength={6}
                    />
                  </label>
                  <div className="editor-actions">
                    <button
                      className="btn btn-small btn-primary"
                      onClick={() => handleSaveEdit(child.id)}
                    >
                      Uložit
                    </button>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => setEditingId(null)}
                    >
                      Zrušit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="child-card__pin-row">
                  <span className="child-card__pin">
                    PIN: {child.pin_plain || "—"}
                  </span>
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={() => startEditing(child)}
                  >
                    Upravit
                  </button>
                </div>
              )}

              {/* Parental reviews section */}
              <div className="child-card__reviews">
                <div className="child-card__reviews-header">
                  <span className="child-card__reviews-title">Opakování</span>
                  <button
                    className="btn btn-small btn-primary"
                    onClick={() => openReviewForm(child.id)}
                  >
                    + Zadat opakování
                  </button>
                </div>

                {showReviewForm === child.id && (
                  <div className="review-form">
                    <label>Balíčky</label>
                    <div className="review-form__pkg-selector">
                      <select
                        value={reviewForm.pendingPackageId}
                        onChange={(e) => setReviewForm({ ...reviewForm, pendingPackageId: e.target.value })}
                      >
                        <option value="">— vyberte —</option>
                        {packages
                          .filter((pkg) => !reviewForm.selectedPackageIds.includes(pkg.id))
                          .map((pkg) => (
                            <option key={pkg.id} value={pkg.id}>
                              {pkg.name}{pkg.grade != null ? ` (${pkg.grade}. r.)` : ""}
                            </option>
                          ))}
                      </select>
                      <button
                        className="btn btn-small btn-secondary"
                        onClick={addPackageToReview}
                        disabled={!reviewForm.pendingPackageId}
                      >
                        Přidat
                      </button>
                    </div>
                    {reviewForm.selectedPackageIds.length > 0 && (
                      <div className="review-form__pkg-chips">
                        {reviewForm.selectedPackageIds.map((pkgId) => {
                          const pkg = packages.find((p) => p.id === pkgId);
                          return (
                            <span key={pkgId} className="review-form__pkg-chip">
                              {pkg ? pkg.name : `#${pkgId}`}
                              <button onClick={() => removePackageFromReview(pkgId)}>&times;</button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <label>
                      Cíl (počet otázek zvládnuto)
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={reviewForm.targetCredits}
                        onChange={(e) => setReviewForm({ ...reviewForm, targetCredits: e.target.value })}
                      />
                    </label>
                    <label>
                      Poznámka (volitelně)
                      <input
                        type="text"
                        value={reviewForm.note}
                        onChange={(e) => setReviewForm({ ...reviewForm, note: e.target.value })}
                        placeholder="např. Procvičit násobilku"
                      />
                    </label>
                    <div className="editor-actions">
                      <button
                        className="btn btn-small btn-primary"
                        onClick={() => handleCreateReview(child.id)}
                        disabled={reviewForm.selectedPackageIds.length === 0}
                      >
                        Vytvořit
                      </button>
                      <button
                        className="btn btn-small btn-secondary"
                        onClick={() => setShowReviewForm(null)}
                      >
                        Zrušit
                      </button>
                    </div>
                  </div>
                )}

                {(reviewsByChild.get(child.id) ?? []).map((r) => (
                  <div key={r.id} className={`review-item review-item--${r.status}`}>
                    <span className="review-item__note">{r.note || "Opakování"}</span>
                    <span className="review-item__progress">
                      {r.current_credits} / {r.target_credits} otázek zvládnuto
                    </span>
                    <span className={`review-item__status review-item__status--${r.status}`}>
                      {r.status === "active" ? "aktivní" : r.status === "completed" ? "splněno ✓" : "zrušeno"}
                    </span>
                    {r.status === "active" && (
                      <button
                        className="btn btn-small btn-secondary"
                        onClick={() => handleCancelReview(child.id, r.id)}
                      >
                        Zrušit
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="add-child-form">
        <h3>Přidat dítě</h3>
        <input
          type="text"
          placeholder="Jméno"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          placeholder="PIN (4 číslice)"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          maxLength={6}
        />
        <input
          type="number"
          placeholder="Ročník"
          min="1"
          max="13"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={handleAdd}
          disabled={!name.trim() || !pin.trim()}
        >
          Přidat
        </button>
      </div>
    </div>
  );
}
