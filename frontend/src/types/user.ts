export interface User {
  id: number;
  name: string;
  role: "parent" | "child";
  avatar: string | null;
  created_at: string;
  reward_progress: number;
  reward_streak: number;
  game_tokens: number;
}

export interface LoginResponse {
  token: string;
  user: User;
}
