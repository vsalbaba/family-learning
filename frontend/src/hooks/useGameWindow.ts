import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";

const EXPIRE_ANIMATION_MS = 2400;

export function useGameWindow() {
  const { user } = useAuth();
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [justExpired, setJustExpired] = useState(false);
  const prevActiveRef = useRef(false);
  const expireTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Backend stores naive UTC — ensure JS parses it as UTC, not local time
  const raw = user?.game_window_expires_at;
  const expiresAt = raw
    ? new Date(raw.endsWith("Z") ? raw : raw + "Z").getTime()
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

  const isActive = remainingSeconds > 0;

  // Detect transition active -> inactive within this hook's lifecycle
  useEffect(() => {
    if (prevActiveRef.current && !isActive) {
      // Clear any pending timeout from a previous transition
      if (expireTimeoutRef.current) clearTimeout(expireTimeoutRef.current);
      setJustExpired(true);
      expireTimeoutRef.current = setTimeout(() => {
        setJustExpired(false);
        expireTimeoutRef.current = null;
      }, EXPIRE_ANIMATION_MS);
    }
    if (isActive && justExpired) {
      // New window activated during animation — cancel it
      if (expireTimeoutRef.current) clearTimeout(expireTimeoutRef.current);
      expireTimeoutRef.current = null;
      setJustExpired(false);
    }
    prevActiveRef.current = isActive;
  }, [isActive]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (expireTimeoutRef.current) clearTimeout(expireTimeoutRef.current);
    };
  }, []);

  return { isActive, remainingSeconds, justExpired };
}
