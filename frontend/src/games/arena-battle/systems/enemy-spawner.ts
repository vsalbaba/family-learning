import type { ArenaGameState } from "../game-state";

/**
 * Spawn enemies in bursts (2-4 enemies with short delays),
 * separated by longer pauses between bursts.
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

    if (state.burstRemaining > 0) {
      // Mid-burst: short delay to next enemy
      state.burstRemaining--;
      state.enemySpawnTimer += state.config.burst.delayMs;
    } else {
      // Burst complete: start new burst after inter-burst pause
      const { minSize, maxSize } = state.config.burst;
      state.burstRemaining = minSize + Math.floor(Math.random() * (maxSize - minSize + 1)) - 1;
      state.enemySpawnTimer += state.enemySpawnInterval;
    }
  }
}
