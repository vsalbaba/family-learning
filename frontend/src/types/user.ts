export interface User {
  id: number;
  name: string;
  role: "parent" | "child";
  avatar: string | null;
  created_at: string;
  reward_progress: number;
  reward_streak: number;
  game_tokens: number;
  game_window_expires_at: string | null;
  grade: number | null;
  pin_plain: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}
