import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { listPackages } from "../api/packages";
import type { PackageSummary } from "../types/package";
import PackageList from "../components/packages/PackageList";

export default function ParentHome() {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
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

  const subjects = useMemo(() => {
    const set = new Set(packages.map((p) => p.subject_name || p.subject).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [packages]);

  const difficulties = useMemo(() => {
    const order = ["easy", "medium", "hard"];
    const set = new Set(packages.map((p) => p.difficulty).filter(Boolean) as string[]);
    return order.filter((d) => set.has(d));
  }, [packages]);

  const filtered = packages.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (subjectFilter !== "all" && (p.subject_name || p.subject) !== subjectFilter) return false;
    if (difficultyFilter !== "all" && p.difficulty !== difficultyFilter) return false;
    return true;
  });

  const DIFFICULTY_LABELS: Record<string, string> = {
    easy: "Lehké",
    medium: "Střední",
    hard: "Těžké",
  };

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
        <div className="filter-group">
          {["all", "draft", "published", "archived"].map((f) => (
            <button
              key={f}
              className={`btn btn-small ${statusFilter === f ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setStatusFilter(f)}
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

        {subjects.length > 0 && (
          <select
            className="filter-select"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="all">Všechny předměty</option>
            {subjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {difficulties.length > 0 && (
          <select
            className="filter-select"
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
          >
            <option value="all">Všechny obtížnosti</option>
            {difficulties.map((d) => (
              <option key={d} value={d}>{DIFFICULTY_LABELS[d] || d}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? <p>Načítání...</p> : <PackageList packages={filtered} />}
    </div>
  );
}
