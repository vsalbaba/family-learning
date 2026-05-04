import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  listChildren, createChild, updateChild,
  getDailyActivity, getSubjectDailyDetail,
} from "../api/auth";
import type { DailyActivity, SubjectDailyDetail } from "../api/auth";
import type { User } from "../types/user";
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
        }
      })
      .finally(() => setLoading(false));
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
