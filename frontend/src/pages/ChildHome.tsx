import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listPackages } from "../api/packages";
import { activateWindow } from "../api/rewards";
import type { PackageSummary } from "../types/package";
import SubjectGrid from "../components/packages/SubjectGrid";
import PackageList from "../components/packages/PackageList";
import TokenIcon from "../components/common/TokenIcon";
import { useAuth } from "../contexts/AuthContext";
import { useGameWindow } from "../hooks/useGameWindow";

export default function ChildHome() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const { isActive: windowActive } = useGameWindow();
  const tokens = user?.game_tokens ?? 0;

  useEffect(() => {
    listPackages()
      .then(setPackages)
      .finally(() => setLoading(false));
  }, []);

  async function playGame(path: string) {
    if (windowActive) {
      navigate(path);
      return;
    }
    if (paying || tokens < 1) return;
    setPaying(true);
    try {
      const resp = await activateWindow();
      if (user)
        setUser({
          ...user,
          game_tokens: resp.game_tokens,
          game_window_expires_at: resp.window_expires_at,
        });
      navigate(path);
    } catch {
      setPaying(false);
    }
  }

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
            {!windowActive && tokens === 0 && (
              <p className="games-no-tokens">
                Nemáš žádné žetony. Procvičuj a získej je!
              </p>
            )}
            <div className="games-buttons">
              <button
                className="btn btn-primary game-btn"
                disabled={!windowActive && (tokens < 1 || paying)}
                onClick={() => playGame("/games/hero-walk")}
              >
                <span>HeroWalk</span>
                {!windowActive && (
                  <span className="game-btn-cost">
                    <TokenIcon size={14} />1
                  </span>
                )}
              </button>
              <button
                className="btn btn-primary game-btn"
                disabled={!windowActive && (tokens < 1 || paying)}
                onClick={() => playGame("/games/farmageddon")}
              >
                <span>Farmageddon</span>
                {!windowActive && (
                  <span className="game-btn-cost">
                    <TokenIcon size={14} />1
                  </span>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
