import { get } from "./client";
import type { WaveConfig } from "../games/farmageddon/types";

interface WaveConfigResponse {
  waves: Array<{
    wave_number: number;
    delay_before_ms: number;
    spawns: Array<{
      lane: number;
      delay_ms: number;
      goblin_type: string;
    }>;
  }>;
}

/** Fetch wave config from backend and convert to frontend types. */
export async function getWaveConfig(): Promise<WaveConfig[]> {
  const resp = await get<WaveConfigResponse>("/farmageddon/waves");
  return resp.waves.map((w) => ({
    waveNumber: w.wave_number,
    delayBeforeMs: w.delay_before_ms,
    spawns: w.spawns.map((s) => ({
      lane: s.lane,
      delayMs: s.delay_ms,
      goblinType: s.goblin_type,
    })),
  }));
}
