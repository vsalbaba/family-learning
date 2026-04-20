import { post } from "./client";

interface ActivateWindowResponse {
  game_tokens: number;
  window_expires_at: string;
  remaining_seconds: number;
}

export function activateWindow() {
  return post<ActivateWindowResponse>("/rewards/activate-window");
}

export interface ArenaResultResponse {
  progress_gained: number;
  tokens_earned: number;
  progress: number;
  game_tokens: number;
}

export function submitArenaResult(correctAnswers: number) {
  return post<ArenaResultResponse>("/rewards/arena-result", {
    correct_answers: correctAnswers,
  });
}
