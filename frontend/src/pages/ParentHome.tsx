import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listPackages } from "../api/packages";
import type { PackageSummary } from "../types/package";
import PackageList from "../components/packages/PackageList";

export default function ParentHome() {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadPackages();
  }, []);

  async function loadPackages() {
    try {
      const pkgs = await listPackages();
      setPackages(pkgs);
    } finally {
      setLoading(false);
    }
  }

  const filtered =
    filter === "all"
      ? packages
      : packages.filter((p) => p.status === filter);

  return (
    <div className="page parent-home">
      <div className="page-header">
        <h2>Balíčky</h2>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={() => navigate("/import")}
          >
            + Importovat balíček
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate("/children")}
          >
            Správa dětí
          </button>
        </div>
      </div>

      <div className="filter-bar">
        {["all", "draft", "published", "archived"].map((f) => (
          <button
            key={f}
            className={`btn btn-small ${filter === f ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter(f)}
          >
            {f === "all"
              ? "Vše"
              : f === "draft"
                ? "Koncepty"
                : f === "published"
                  ? "Publikované"
                  : "Archivované"}
          </button>
        ))}
      </div>

      {loading ? <p>Načítání...</p> : <PackageList packages={filtered} />}
    </div>
  );
}
