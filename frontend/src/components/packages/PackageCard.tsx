import { useNavigate } from "react-router-dom";
import type { PackageSummary } from "../../types/package";
import { useAuth } from "../../contexts/AuthContext";

const STATUS_LABELS: Record<string, string> = {
  draft: "Koncept",
  ready: "Připraveno",
  published: "Publikováno",
  archived: "Archivováno",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Snadné",
  medium: "Střední",
  hard: "Těžké",
};

interface Props {
  pkg: PackageSummary;
  isChild?: boolean;
}

export default function PackageCard({ pkg, isChild }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBelowGrade = isChild && user?.grade && pkg.grade != null && pkg.grade < user.grade;

  return (
    <div
      className={`package-card package-card--${pkg.status}`}
      onClick={() =>
        navigate(isChild ? `/lesson/${pkg.id}` : `/packages/${pkg.id}`)
      }
    >
      <div className="package-card__header">
        <h3>{pkg.name}</h3>
        {!isChild && (
          <span className={`status-badge status-badge--${pkg.status}`}>
            {STATUS_LABELS[pkg.status] || pkg.status}
          </span>
        )}
      </div>
      <div className="package-card__meta">
        {pkg.subject && <span className="tag">{pkg.subject}</span>}
        {pkg.grade != null && <span className="tag">{pkg.grade}. ročník</span>}
        {pkg.topic && <span className="tag">{pkg.topic}</span>}
        {pkg.difficulty && (
          <span className="tag">
            {DIFFICULTY_LABELS[pkg.difficulty] || pkg.difficulty}
          </span>
        )}
        <span className="tag">{pkg.item_count} otázek</span>
        {isBelowGrade && <span className="tag tag--muted">Procvičování</span>}
      </div>
      {pkg.description && (
        <p className="package-card__desc">{pkg.description}</p>
      )}
      {isChild && (
        <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); navigate(`/lesson/${pkg.id}`); }}>
          Procvičovat
        </button>
      )}
    </div>
  );
}
