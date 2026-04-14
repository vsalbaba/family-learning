import type { PackageSummary } from "../../types/package";
import PackageCard from "./PackageCard";

interface Props {
  packages: PackageSummary[];
  isChild?: boolean;
}

export default function PackageList({ packages, isChild }: Props) {
  if (packages.length === 0) {
    return (
      <div className="empty-state">
        <p>{isChild ? "Zatím nemáš žádné balíčky." : "Zatím žádné balíčky. Importujte první!"}</p>
      </div>
    );
  }

  return (
    <div className="package-list">
      {packages.map((pkg) => (
        <PackageCard key={pkg.id} pkg={pkg} isChild={isChild} />
      ))}
    </div>
  );
}
