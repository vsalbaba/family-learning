import { get, patch } from "./client";

export type GameKey = "hero-walk" | "farmageddon" | "arena-battle";

export interface GameProgress {
  gameKey: GameKey;
  xp: number;
  data: Record<string, unknown>;
  summary: Record<string, unknown>;
}

export interface GameProgressUpdate {
  xpDelta?: number;
  dataPatch?: Record<string, unknown>;
  summary?: Record<string, unknown>;
}

interface RawGameProgress {
  game_key: string;
  xp: number;
  data: Record<string, unknown>;
  summary: Record<string, unknown>;
}

function fromRaw(raw: RawGameProgress): GameProgress {
  return {
    gameKey: raw.game_key as GameKey,
    xp: raw.xp,
    data: raw.data,
    summary: raw.summary,
  };
}

function toRaw(update: GameProgressUpdate): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (update.xpDelta !== undefined) body.xp_delta = update.xpDelta;
  if (update.dataPatch !== undefined) body.data_patch = update.dataPatch;
  if (update.summary !== undefined) body.summary = update.summary;
  return body;
}

export async function getAllGameProgress(): Promise<GameProgress[]> {
  const raw = await get<RawGameProgress[]>("/game-progress");
  return raw.map(fromRaw);
}

export async function getGameProgress(gameKey: GameKey): Promise<GameProgress> {
  const raw = await get<RawGameProgress>(`/game-progress/${gameKey}`);
  return fromRaw(raw);
}

export async function updateGameProgress(
  gameKey: GameKey,
  update: GameProgressUpdate,
): Promise<GameProgress> {
  const raw = await patch<RawGameProgress>(
    `/game-progress/${gameKey}`,
    toRaw(update),
  );
  return fromRaw(raw);
}
