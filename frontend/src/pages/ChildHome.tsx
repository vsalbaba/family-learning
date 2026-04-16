import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listPackages } from "../api/packages";
import type { PackageSummary } from "../types/package";
import SubjectGrid from "../components/packages/SubjectGrid";
import PackageList from "../components/packages/PackageList";
import { useAuth } from "../contexts/AuthContext";

export default function ChildHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPackages()
      .then(setPackages)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page child-home">
      <div className="page-header">
        <h2>Ahoj, {user?.name}! Co si dnes procvičíš?</h2>
      </div>
      {loading ? (
        <p>Načítání...</p>
      ) : (
        <>
          <SubjectGrid />
          <PackageList packages={packages} isChild />
          <div className="games-section">
            <h3>Hry</h3>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/games/hero-walk")}
            >
              HeroWalk
            </button>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/games/farmageddon")}
            >
              Farmageddon
            </button>
          </div>
        </>
      )}
    </div>
  );
}
