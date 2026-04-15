import { useAuth } from "../../contexts/AuthContext";
import TokenIcon from "../common/TokenIcon";

export default function Header() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="app-title">Učení</h1>
      </div>
      <div className="header-right">
        <span className="user-badge">
          {user.avatar || (user.role === "parent" ? "👨‍👩‍👧" : "🧒")} {user.name}
        </span>
        {user.role === "child" && (
          <div className="header-reward">
            <div className="reward-progress-bar">
              <div
                className="reward-progress-fill"
                style={{ width: `${user.reward_progress}%` }}
              />
            </div>
            <span className="token-badge">
              <TokenIcon size={18} />
              <span>{user.game_tokens}</span>
            </span>
          </div>
        )}
        <button className="btn btn-small" onClick={logout}>
          Odhlásit
        </button>
      </div>
    </header>
  );
}
