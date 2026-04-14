export interface User {
  id: number;
  name: string;
  role: "parent" | "child";
  avatar: string | null;
  created_at: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
