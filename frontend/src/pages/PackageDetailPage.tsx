import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPackage, publishPackage, archivePackage, deletePackage } from "../api/packages";
import type { PackageDetail } from "../types/package";

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

  useEffect(() => {
    if (id) {
      getPackage(Number(id))
        .then(setPkg)
        .finally(() => setLoading(false));
    }
  }, [id]);

  async function handlePublish() {
    if (!pkg) return;
    await publishPackage(pkg.id);
    setPkg({ ...pkg, status: "published" });
  }

  async function handleArchive() {
    if (!pkg) return;
    await archivePackage(pkg.id);
    setPkg({ ...pkg, status: "archived" });
  }

  async function handleDelete() {
    if (!pkg) return;
    if (!confirm("Opravdu smazat tento balíček?")) return;
    await deletePackage(pkg.id);
    navigate("/");
  }

  if (loading) return <p>Načítání...</p>;
  if (!pkg) return <p>Balíček nenalezen.</p>;

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
        <button className="btn btn-secondary" onClick={() => navigate("/")}>
          Zpět
        </button>
      </div>

      {pkg.description && <p>{pkg.description}</p>}

      <div className="package-actions">
        {(pkg.status === "draft" || pkg.status === "ready") && (
          <button className="btn btn-primary" onClick={handlePublish}>
            Publikovat
          </button>
        )}
        {pkg.status === "published" && (
          <button className="btn btn-secondary" onClick={handleArchive}>
            Archivovat
          </button>
        )}
        {pkg.status !== "published" && (
          <button className="btn btn-danger" onClick={handleDelete}>
            Smazat
          </button>
        )}
      </div>

      <h3>Otázky ({pkg.items.length})</h3>
      <div className="item-list">
        {pkg.items.map((item, i) => (
          <div key={item.id} className="item-row">
            <span className="item-num">{i + 1}.</span>
            <span className="item-type tag">
              {ACTIVITY_LABELS[item.activity_type] || item.activity_type}
            </span>
            <span className="item-question">{item.question}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
