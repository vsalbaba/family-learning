import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listChildren, createChild } from "../api/auth";
import type { User } from "../types/user";

export default function ChildrenPage() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(true);

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
              <span>{child.avatar || "🧒"}</span>
              <span>{child.name}</span>
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
