import { useAuth } from "../../contexts/AuthContext";

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
        <button className="btn btn-small" onClick={logout}>
          Odhlásit
        </button>
      </div>
    </header>
  );
}
