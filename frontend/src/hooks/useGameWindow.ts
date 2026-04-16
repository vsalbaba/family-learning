import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

export function useGameWindow() {
  const { user } = useAuth();
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const expiresAt = user?.game_window_expires_at
    ? new Date(user.game_window_expires_at).getTime()
    : null;

  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(0);
      return;
    }
    const update = () => {
      setRemainingSeconds(
        Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return { isActive: remainingSeconds > 0, remainingSeconds };
}
