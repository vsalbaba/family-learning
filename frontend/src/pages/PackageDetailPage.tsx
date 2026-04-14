import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getPackage,
  updatePackage,
  publishPackage,
  unpublishPackage,
  archivePackage,
  deletePackage,
  updateItem,
  createItem,
  deleteItem,
} from "../api/packages";
import type { ActivityType, PackageDetail, PackageItem } from "../types/package";
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

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [addingType, setAddingType] = useState<ActivityType | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ name: "", subject: "", difficulty: "", description: "" });

  useEffect(() => {
    if (id) {
      getPackage(Number(id))
        .then(setPkg)
        .finally(() => setLoading(false));
    }
  }, [id]);

  async function handleStatusChange(action: "publish" | "unpublish" | "archive") {
    if (!pkg) return;
    if (action === "publish") {
      await publishPackage(pkg.id);
      setPkg({ ...pkg, status: "published" });
    } else if (action === "unpublish") {
      await unpublishPackage(pkg.id);
      setPkg({ ...pkg, status: "draft" });
    } else {
      await archivePackage(pkg.id);
      setPkg({ ...pkg, status: "archived" });
    }
  }

  async function handleDelete() {
    if (!pkg) return;
    if (!confirm("Opravdu smazat tento balíček?")) return;
    await deletePackage(pkg.id);
    navigate("/");
  }

  function startEditMeta() {
    if (!pkg) return;
    setMetaForm({
      name: pkg.name,
      subject: pkg.subject ?? "",
      difficulty: pkg.difficulty ?? "",
      description: pkg.description ?? "",
    });
    setEditingMeta(true);
  }

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!pkg) return;
    await updatePackage(pkg.id, {
      name: metaForm.name,
      subject: metaForm.subject || null,
      difficulty: metaForm.difficulty || null,
      description: metaForm.description || null,
    });
    setPkg({
      ...pkg,
      name: metaForm.name,
      subject: metaForm.subject || null,
      difficulty: metaForm.difficulty || null,
      description: metaForm.description || null,
    });
    setEditingMeta(false);
  }

  async function handleSaveItem(itemId: number, data: Record<string, unknown>) {
    if (!pkg) return;
    const updated = await updateItem(pkg.id, itemId, data);
    setPkg({
      ...pkg,
      items: pkg.items.map((it) => (it.id === itemId ? updated : it)),
    });
    setEditingItemId(null);
  }

  async function handleCreateItem(data: Record<string, unknown>) {
    if (!pkg) return;
    const created = await createItem(pkg.id, data);
    setPkg({ ...pkg, items: [...pkg.items, created], item_count: pkg.item_count + 1 });
    setAddingType(null);
  }

  async function handleDeleteItem(item: PackageItem) {
    if (!pkg) return;
    if (!confirm(`Smazat otázku "${item.question}"?`)) return;
    await deleteItem(pkg.id, item.id);
    setPkg({
      ...pkg,
      items: pkg.items.filter((it) => it.id !== item.id),
      item_count: pkg.item_count - 1,
    });
  }

  if (loading) return <p>Načítání...</p>;
  if (!pkg) return <p>Balíček nenalezen.</p>;

  const isEditable = pkg.status === "draft" || pkg.status === "ready";

  return (
    <div className="page package-detail">
      <div className="page-header">
        <div>
          <h2>{pkg.name}</h2>
          <div className="package-meta">
            {pkg.subject && <span className="tag">{pkg.subject}</span>}
            {pkg.difficulty && <span className="tag">{pkg.difficulty}</span>}
            <span className={`status-badge status-badge--${pkg.status}`}>
              {pkg.status}
            </span>
          </div>
        </div>
        <div className="page-header-actions">
          {!editingMeta && (
            <button className="btn btn-small btn-secondary" onClick={startEditMeta}>
              Upravit metadata
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate("/")}>
            Zpět
          </button>
        </div>
      </div>

      {editingMeta ? (
        <form className="meta-editor" onSubmit={handleSaveMeta}>
          <label>
            Název
            <input
              value={metaForm.name}
              onChange={(e) => setMetaForm({ ...metaForm, name: e.target.value })}
              required
            />
          </label>
          <label>
            Předmět
            <input
              value={metaForm.subject}
              onChange={(e) => setMetaForm({ ...metaForm, subject: e.target.value })}
            />
          </label>
          <label>
            Obtížnost
            <select
              value={metaForm.difficulty}
              onChange={(e) => setMetaForm({ ...metaForm, difficulty: e.target.value })}
            >
              <option value="">—</option>
              <option value="easy">Lehké</option>
              <option value="medium">Střední</option>
              <option value="hard">Těžké</option>
            </select>
          </label>
          <label>
            Popis
            <input
              value={metaForm.description}
              onChange={(e) => setMetaForm({ ...metaForm, description: e.target.value })}
            />
          </label>
          <div className="editor-actions">
            <button type="submit" className="btn btn-primary">Uložit</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingMeta(false)}>
              Zrušit
            </button>
          </div>
        </form>
      ) : (
        pkg.description && <p>{pkg.description}</p>
      )}

      <div className="package-actions">
        {pkg.status === "draft" && (
          <>
            <button className="btn btn-primary" onClick={() => handleStatusChange("publish")}>
              Publikovat
            </button>
            <button className="btn btn-secondary" onClick={() => handleStatusChange("archive")}>
              Archivovat
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              Smazat
            </button>
          </>
        )}
        {pkg.status === "ready" && (
          <>
            <button className="btn btn-primary" onClick={() => handleStatusChange("publish")}>
              Publikovat
            </button>
            <button className="btn btn-secondary" onClick={() => handleStatusChange("archive")}>
              Archivovat
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              Smazat
            </button>
          </>
        )}
        {pkg.status === "published" && (
          <>
            <button className="btn btn-secondary" onClick={() => handleStatusChange("unpublish")}>
              Vrátit do konceptu
            </button>
            <button className="btn btn-secondary" onClick={() => handleStatusChange("archive")}>
              Archivovat
            </button>
          </>
        )}
        {pkg.status === "archived" && (
          <>
            <button className="btn btn-primary" onClick={() => handleStatusChange("publish")}>
              Publikovat
            </button>
            <button className="btn btn-secondary" onClick={() => handleStatusChange("unpublish")}>
              Vrátit do konceptu
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              Smazat
            </button>
          </>
        )}
      </div>

      <h3>Otázky ({pkg.items.length})</h3>
      <div className="item-list">
        {pkg.items.map((item, i) => (
          <div key={item.id} className="item-row-wrap">
            <div className="item-row">
              <span className="item-num">{i + 1}.</span>
              <span className="item-type tag">
                {ACTIVITY_LABELS[item.activity_type] || item.activity_type}
              </span>
              <span className="item-question">{item.question}</span>
              {isEditable && (
                <div className="item-actions">
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={() => setEditingItemId(editingItemId === item.id ? null : item.id)}
                  >
                    {editingItemId === item.id ? "Zrušit" : "Upravit"}
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => handleDeleteItem(item)}
                  >
                    Smazat
                  </button>
                </div>
              )}
            </div>
            {editingItemId === item.id && (
              <ItemEditor
                item={item}
                activityType={item.activity_type}
                onSave={(data) => handleSaveItem(item.id, data)}
                onCancel={() => setEditingItemId(null)}
              />
            )}
          </div>
        ))}
      </div>

      {isEditable && !addingType && (
        <div className="add-item-section">
          <h4>Přidat otázku</h4>
          <div className="add-item-types">
            {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map((type) => (
              <button
                key={type}
                className="btn btn-secondary"
                onClick={() => { setAddingType(type); setEditingItemId(null); }}
              >
                {ACTIVITY_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      )}

      {addingType && (
        <div className="add-item-section">
          <h4>Nová otázka: {ACTIVITY_LABELS[addingType]}</h4>
          <ItemEditor
            activityType={addingType}
            onSave={handleCreateItem}
            onCancel={() => setAddingType(null)}
          />
        </div>
      )}
    </div>
  );
}
