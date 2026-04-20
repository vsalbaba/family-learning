import type { ArenaGameState } from "../game-state";

/**
 * Spawn enemies from the right castle at decreasing intervals.
 * The current interval is determined by spawnPhases config based on elapsed time.
 */
export function updateEnemySpawner(state: ArenaGameState, dt: number): void {
  if (state.phase !== "playing") return;

  // Update spawn interval based on elapsed time
  const elapsed = state.config.gameDurationMs - state.remainingMs;
  const phases = state.config.spawnPhases;
  for (let i = phases.length - 1; i >= 0; i--) {
    if (elapsed >= phases[i].afterMs) {
      state.enemySpawnInterval = phases[i].intervalMs;
      break;
    }
  }

  state.enemySpawnTimer -= dt;
  if (state.enemySpawnTimer <= 0) {
    state.spawnEnemy();
    state.enemySpawnTimer += state.enemySpawnInterval;
  }
}
