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
  const [loading, setLoading] = useState(true);
  const [editingPinId, setEditingPinId] = useState<number | null>(null);
  const [newPin, setNewPin] = useState("");

  useEffect(() => {
    listChildren()
      .then(setChildren)
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd() {
    if (!name.trim() || !pin.trim()) return;
    const child = await createChild(name.trim(), pin.trim());
    setChildren((c) => [...c, child]);
    setName("");
    setPin("");
  }

  async function handleChangePin(childId: number) {
    if (!newPin.trim()) return;
    const updated = await updateChild(childId, { pin: newPin.trim() });
    setChildren((c) => c.map((ch) => (ch.id === childId ? updated : ch)));
    setEditingPinId(null);
    setNewPin("");
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
              <div className="child-card__pin-row">
                {editingPinId === child.id ? (
                  <>
                    <input
                      type="text"
                      placeholder="Nový PIN"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      maxLength={6}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      className="btn btn-small btn-primary"
                      onClick={() => handleChangePin(child.id)}
                      disabled={!newPin.trim()}
                    >
                      Uložit
                    </button>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => { setEditingPinId(null); setNewPin(""); }}
                    >
                      Zrušit
                    </button>
                  </>
                ) : (
                  <>
                    <span className="child-card__pin">
                      PIN: {child.pin_plain || "—"}
                    </span>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => { setEditingPinId(child.id); setNewPin(""); }}
                    >
                      Změnit PIN
                    </button>
                  </>
                )}
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
