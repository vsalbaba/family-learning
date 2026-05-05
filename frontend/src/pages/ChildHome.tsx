import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listPackages } from "../api/packages";
import { activateWindow } from "../api/rewards";
import { getAllGameProgress } from "../api/gameProgress";
import { listChildReviews } from "../api/parentalReviews";
import type { GameKey, GameProgress } from "../api/gameProgress";
import type { PackageSummary } from "../types/package";
import type { ParentalReview } from "../types/parentalReview";
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
  const [progressMap, setProgressMap] = useState<Partial<Record<GameKey, GameProgress>>>({});
  const [activeReviews, setActiveReviews] = useState<ParentalReview[]>([]);

  const { isActive: windowActive } = useGameWindow();
  const tokens = user?.game_tokens ?? 0;

  useEffect(() => {
    listPackages()
      .then(setPackages)
      .finally(() => setLoading(false));
    getAllGameProgress()
      .then((list) => {
        const map: Partial<Record<GameKey, GameProgress>> = {};
        for (const p of list) map[p.gameKey] = p;
        setProgressMap(map);
      })
      .catch(() => {});
    if (user) {
      listChildReviews(user.id)
        .then((reviews) => setActiveReviews(reviews.filter((r) => r.status === "active")))
        .catch(() => {});
    }
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
          {activeReviews.length > 0 && (
            <div className="parental-reviews-section">
              <h3>Opakování od rodiče</h3>
              <div className="parental-reviews-list">
                {activeReviews.map((r) => (
                  <button
                    key={r.id}
                    className="btn btn-primary parental-review-btn"
                    onClick={() => navigate(`/parental-review/${r.id}`)}
                  >
                    <span className="parental-review-btn__label">
                      {r.note || "Opakování"}
                    </span>
                    <span className="parental-review-btn__progress">
                      {r.current_credits} / {r.target_credits} kreditů
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
                {typeof progressMap["hero-walk"]?.summary?.label === "string" && (
                  <span className="game-btn-level">{progressMap["hero-walk"].summary.label}</span>
                )}
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
                {typeof progressMap["farmageddon"]?.summary?.label === "string" && (
                  <span className="game-btn-level">{progressMap["farmageddon"].summary.label}</span>
                )}
                {!windowActive && (
                  <span className="game-btn-cost">
                    <TokenIcon size={14} />1
                  </span>
                )}
              </button>
              <button
                className="btn btn-primary game-btn"
                onClick={() => navigate("/games/arena-battle")}
              >
                <span>Aréna</span>
                {typeof progressMap["arena-battle"]?.summary?.label === "string" && (
                  <span className="game-btn-level">{progressMap["arena-battle"].summary.label}</span>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
