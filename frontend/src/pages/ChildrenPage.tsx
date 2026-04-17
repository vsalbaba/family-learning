import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listChildren, createChild, updateChild } from "../api/auth";
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

  useEffect(() => {
    listChildren()
      .then(setChildren)
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
