import { useState, useEffect } from "react";
import { listPackages } from "../api/packages";
import type { PackageSummary } from "../types/package";
import PackageList from "../components/packages/PackageList";
import { useAuth } from "../contexts/AuthContext";

export default function ChildHome() {
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
        <PackageList packages={packages} isChild />
      )}
    </div>
  );
}
