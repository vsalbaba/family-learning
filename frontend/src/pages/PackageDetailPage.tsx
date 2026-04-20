import { useState, useEffect, useReducer } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getPackage,
  listPackages,
  updatePackage,
  publishPackage,
  unpublishPackage,
  archivePackage,
  deletePackage,
  mergePackages,
  updateItem,
  createItem,
  deleteItem,
  exportPackage,
} from "../api/packages";
import type { ActivityType, PackageDetail, PackageItem, PackageSummary } from "../types/package";
import ItemEditor from "../components/packages/ItemEditor";

type PageMode =
  | { type: "viewing" }
  | { type: "editingItem"; itemId: number }
  | { type: "addingItem"; activityType: ActivityType }
  | { type: "editingMeta" }
  | { type: "merging"; selectedIds: Set<number> };

type ModeAction =
  | { type: "VIEW" }
  | { type: "EDIT_ITEM"; itemId: number }
  | { type: "ADD_ITEM"; activityType: ActivityType }
  | { type: "EDIT_META" }
  | { type: "START_MERGE" }
  | { type: "TOGGLE_SOURCE"; id: number };

function modeReducer(state: PageMode, action: ModeAction): PageMode {
  switch (action.type) {
    case "VIEW":
      return { type: "viewing" };
    case "EDIT_ITEM":
      return { type: "editingItem", itemId: action.itemId };
    case "ADD_ITEM":
      return { type: "addingItem", activityType: action.activityType };
    case "EDIT_META":
      return { type: "editingMeta" };
    case "START_MERGE":
      return { type: "merging", selectedIds: new Set() };
    case "TOGGLE_SOURCE": {
      if (state.type !== "merging") return state;
      const next = new Set(state.selectedIds);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { type: "merging", selectedIds: next };
    }
  }
}

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
  const [mode, dispatch] = useReducer(modeReducer, { type: "viewing" } as PageMode);
  const [metaForm, setMetaForm] = useState({ name: "", subject: "", difficulty: "", description: "", tts_lang: "", grade: "", topic: "" });
  const [otherPackages, setOtherPackages] = useState<PackageSummary[]>([]);

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
      tts_lang: pkg.tts_lang ?? "",
      grade: pkg.grade != null ? String(pkg.grade) : "",
      topic: pkg.topic ?? "",
    });
    dispatch({ type: "EDIT_META" });
  }

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!pkg) return;
    await updatePackage(pkg.id, {
      name: metaForm.name,
      subject: metaForm.subject || null,
      difficulty: metaForm.difficulty || null,
      description: metaForm.description || null,
      tts_lang: metaForm.tts_lang || "",
      grade: metaForm.grade ? parseInt(metaForm.grade) : 0,
      topic: metaForm.topic || "",
    });
    setPkg({
      ...pkg,
      name: metaForm.name,
      subject: metaForm.subject || null,
      difficulty: metaForm.difficulty || null,
      description: metaForm.description || null,
      tts_lang: metaForm.tts_lang || null,
      grade: metaForm.grade ? parseInt(metaForm.grade) : null,
      topic: metaForm.topic || null,
    });
    dispatch({ type: "VIEW" });
  }

  async function handleSaveItem(itemId: number, data: Record<string, unknown>) {
    if (!pkg) return;
    const updated = await updateItem(pkg.id, itemId, data);
    setPkg({
      ...pkg,
      items: pkg.items.map((it) => (it.id === itemId ? updated : it)),
    });
    dispatch({ type: "VIEW" });
  }

  async function handleCreateItem(data: Record<string, unknown>) {
    if (!pkg) return;
    const created = await createItem(pkg.id, data);
    setPkg({ ...pkg, items: [...pkg.items, created], item_count: pkg.item_count + 1 });
    dispatch({ type: "VIEW" });
  }

  async function startMerge() {
    const all = await listPackages();
    setOtherPackages(all.filter((p) => p.id !== pkg?.id));
    dispatch({ type: "START_MERGE" });
  }

  async function handleMerge() {
    if (!pkg || mode.type !== "merging" || mode.selectedIds.size === 0) return;
    const sourceIds = Array.from(mode.selectedIds);
    const names = otherPackages
      .filter((p) => sourceIds.includes(p.id))
      .map((p) => p.name);
    const totalItems = otherPackages
      .filter((p) => sourceIds.includes(p.id))
      .reduce((sum, p) => sum + p.item_count, 0);
    if (
      !confirm(
        `Sloučit ${names.length} balíčk${names.length === 1 ? "" : names.length < 5 ? "y" : "ů"} (${totalItems} otázek) do "${pkg.name}"?\n\nZdrojové balíčky budou smazány:\n${names.map((n) => `• ${n}`).join("\n")}`
      )
    )
      return;
    const updated = await mergePackages(pkg.id, sourceIds);
    setPkg(updated);
    dispatch({ type: "VIEW" });
  }

  async function handleDeleteItem(item: PackageItem) {
    if (!pkg) return;
    if (!confirm(`Smazat otázku "${item.question}"?`)) return;
    try {
      await deleteItem(pkg.id, item.id);
      setPkg({
        ...pkg,
        items: pkg.items.filter((it) => it.id !== item.id),
        item_count: pkg.item_count - 1,
      });
    } catch (error) {
      alert(`Chyba při mazání: ${error instanceof Error ? error.message : "Neznámá chyba"}`);
    }
  }

  if (loading) return <p>Načítání...</p>;
  if (!pkg) return <p>Balíček nenalezen.</p>;

  const isEditable = true;

  return (
    <div className="page package-detail">
      <div className="page-header">
        <div>
          <h2>{pkg.name}</h2>
          <div className="package-meta">
            {pkg.subject && <span className="tag">{pkg.subject}</span>}
            {pkg.grade != null && <span className="tag">{pkg.grade}. ročník</span>}
            {pkg.topic && <span className="tag">{pkg.topic}</span>}
            {pkg.difficulty && <span className="tag">{pkg.difficulty}</span>}
            {pkg.tts_lang && <span className="tag">TTS: {pkg.tts_lang}</span>}
            <span className={`status-badge status-badge--${pkg.status}`}>
              {pkg.status}
            </span>
          </div>
        </div>
        <div className="page-header-actions">
          {pkg.items.length > 0 && (
            <button
              className="btn btn-small btn-primary"
              onClick={() => navigate(`/packages/${pkg.id}/preview`)}
            >
              Vyzkoušet balíček
            </button>
          )}
          {mode.type !== "editingMeta" && (
            <button className="btn btn-small btn-secondary" onClick={startEditMeta}>
              Upravit metadata
            </button>
          )}
          {mode.type !== "merging" && (
            <button className="btn btn-small btn-secondary" onClick={startMerge}>
              Sloučit
            </button>
          )}
          <button
            className="btn btn-small btn-secondary"
            onClick={async () => {
              const data = await exportPackage(pkg.id);
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${pkg.name.replace(/\s+/g, "_")}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Exportovat JSON
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/")}>
            Zpět
          </button>
        </div>
      </div>

      {mode.type === "editingMeta" ? (
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
            Ročník
            <input
              type="number"
              min="1"
              max="13"
              value={metaForm.grade}
              onChange={(e) => setMetaForm({ ...metaForm, grade: e.target.value })}
              placeholder="—"
            />
          </label>
          <label>
            Téma
            <input
              value={metaForm.topic}
              onChange={(e) => setMetaForm({ ...metaForm, topic: e.target.value })}
              placeholder="např. malá násobilka"
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
          <label>
            Vyslovnost (TTS)
            <select
              value={metaForm.tts_lang}
              onChange={(e) => setMetaForm({ ...metaForm, tts_lang: e.target.value })}
            >
              <option value="">Vypnuto</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
          <div className="editor-actions">
            <button type="submit" className="btn btn-primary">Uložit</button>
            <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: "VIEW" })}>
              Zrušit
            </button>
          </div>
        </form>
      ) : (
        pkg.description && <p>{pkg.description}</p>
      )}

      {mode.type === "merging" && (
        <div className="merge-panel">
          <h3>Sloučit do tohoto balíčku</h3>
          {otherPackages.length === 0 ? (
            <p>Žádné další balíčky k sloučení.</p>
          ) : (
            <div className="merge-list">
              {otherPackages.map((p) => (
                <label key={p.id} className="merge-item">
                  <input
                    type="checkbox"
                    checked={mode.selectedIds.has(p.id)}
                    onChange={() => dispatch({ type: "TOGGLE_SOURCE", id: p.id })}
                  />
                  <span className="merge-item__name">{p.name}</span>
                  <span className="merge-item__count">({p.item_count} otázek)</span>
                  <span className={`status-badge status-badge--${p.status}`}>{p.status}</span>
                </label>
              ))}
            </div>
          )}
          <div className="editor-actions">
            <button
              className="btn btn-primary"
              onClick={handleMerge}
              disabled={mode.selectedIds.size === 0}
            >
              Sloučit vybrané
            </button>
            <button className="btn btn-secondary" onClick={() => dispatch({ type: "VIEW" })}>
              Zrušit
            </button>
          </div>
        </div>
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
              <div className="item-actions">
                <button
                  className="btn btn-small btn-primary"
                  onClick={() => navigate(`/packages/${pkg.id}/preview?item=${item.id}`)}
                >
                  Vyzkoušet
                </button>
                {isEditable && (
                  <>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => dispatch(
                        mode.type === "editingItem" && mode.itemId === item.id
                          ? { type: "VIEW" }
                          : { type: "EDIT_ITEM", itemId: item.id }
                      )}
                    >
                      {mode.type === "editingItem" && mode.itemId === item.id ? "Zrušit" : "Upravit"}
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDeleteItem(item)}
                    >
                      Smazat
                    </button>
                  </>
                )}
              </div>
            </div>
            {mode.type === "editingItem" && mode.itemId === item.id && (
              <ItemEditor
                item={item}
                activityType={item.activity_type}
                onSave={(data) => handleSaveItem(item.id, data)}
                onCancel={() => dispatch({ type: "VIEW" })}
              />
            )}
          </div>
        ))}
      </div>

      {isEditable && mode.type !== "addingItem" && (
        <div className="add-item-section">
          <h4>Přidat otázku</h4>
          <div className="add-item-types">
            {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map((type) => (
              <button
                key={type}
                className="btn btn-secondary"
                onClick={() => dispatch({ type: "ADD_ITEM", activityType: type })}
              >
                {ACTIVITY_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode.type === "addingItem" && (
        <div className="add-item-section">
          <h4>Nová otázka: {ACTIVITY_LABELS[mode.activityType]}</h4>
          <ItemEditor
            activityType={mode.activityType}
            onSave={handleCreateItem}
            onCancel={() => dispatch({ type: "VIEW" })}
          />
        </div>
      )}
    </div>
  );
}
