import { post } from "./client";

export function consumeToken() {
  return post<{ game_tokens: number }>("/rewards/consume-token");
}
