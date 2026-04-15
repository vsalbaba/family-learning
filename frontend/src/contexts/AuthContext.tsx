import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { User } from "../types/user";
import { getMe } from "../api/auth";

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null, token?: string) => void;
  logout: () => void;
  updateRewardState: (r: { progress: number; streak: number; game_tokens: number }) => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: () => {},
  updateRewardState: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((u) => setUserState(u))
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));
  }, []);

  function setUser(u: User | null, token?: string) {
    if (token) localStorage.setItem("token", token);
    setUserState(u);
  }

  function logout() {
    localStorage.removeItem("token");
    setUserState(null);
  }

  function updateRewardState(r: { progress: number; streak: number; game_tokens: number }) {
    setUserState((prev) =>
      prev
        ? {
            ...prev,
            reward_progress: r.progress,
            reward_streak: r.streak,
            game_tokens: r.game_tokens,
          }
        : null,
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout, updateRewardState }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
