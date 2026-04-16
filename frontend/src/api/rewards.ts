import { post } from "./client";

interface ActivateWindowResponse {
  game_tokens: number;
  window_expires_at: string;
  remaining_seconds: number;
}

export function activateWindow() {
  return post<ActivateWindowResponse>("/rewards/activate-window");
}
