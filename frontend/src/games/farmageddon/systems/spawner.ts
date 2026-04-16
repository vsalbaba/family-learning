import type { GameState } from "../game-state";

export function updateSpawner(state: GameState, dt: number): void {
  const { config } = state;
  if (state.wavesFinished) return;
  if (config.waves.length === 0) return;

  // Waiting for next wave to start
  if (state.spawnQueue.length === 0 && state.currentWave < config.waves.length) {
    state.pendingWaveDelay -= dt;
    if (state.pendingWaveDelay > 0) return;

    // Start next wave
    const wave = config.waves[state.currentWave];
    state.currentWave++;
    state.waveTimer = 0;
    state.spawnQueue = wave.spawns.map((s) => ({ ...s }));
    state.spawnQueue.sort((a, b) => a.delayMs - b.delayMs);
  }

  // Process spawn queue
  if (state.spawnQueue.length > 0) {
    state.waveTimer += dt;

    while (
      state.spawnQueue.length > 0 &&
      state.spawnQueue[0].delayMs <= state.waveTimer
    ) {
      const entry = state.spawnQueue.shift()!;
      state.spawnGoblin(entry.lane, entry.goblinType);
    }

    // Wave fully spawned, prepare for next
    if (state.spawnQueue.length === 0) {
      if (state.currentWave >= config.waves.length) {
        state.wavesFinished = true;
      } else {
        state.pendingWaveDelay = config.waves[state.currentWave].delayBeforeMs;
      }
    }
  }
}
