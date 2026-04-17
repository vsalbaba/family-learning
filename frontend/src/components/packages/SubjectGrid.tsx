import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listSubjects } from "../../api/lessons";
import type { SubjectInfo } from "../../api/lessons";

export default function SubjectGrid() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);

  useEffect(() => {
    listSubjects().then(setSubjects).catch(() => {});
  }, []);

  if (subjects.length === 0) return null;

  return (
    <div className="subject-section">
      <h3 className="subject-section__title">Opakuj předmět</h3>
      <div className="subject-grid">
        {subjects.map((s) => (
          <button
            key={s.subject}
            className="subject-tile"
            onClick={() =>
              navigate(
                `/lesson/subject/${encodeURIComponent(s.subject)}${s.grade != null ? `?grade=${s.grade}` : ""}`
              )
            }
          >
            <span className="subject-tile__name">{s.display}</span>
            <span className="subject-tile__count">
              {s.package_count} {s.package_count === 1 ? "balíček" : s.package_count < 5 ? "balíčky" : "balíčků"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
