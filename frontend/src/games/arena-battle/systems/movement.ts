import type { ArenaGameState } from "../game-state";

/**
 * Move all units along the x axis.
 * Player units move right, enemies move left.
 * Units stop when they have a live target within attack range.
 */
export function updateMovement(state: ArenaGameState, dt: number): void {
  const dtSec = dt / 1000;

  // Move player units → right
  for (const unit of state.playerUnits.values()) {
    if (unit.state === "dying" || unit.state === "hit") continue;

    // Find nearest enemy by absolute distance (not directional)
    let nearestDist = Infinity;
    for (const enemy of state.enemies.values()) {
      if (enemy.state === "dying" || enemy.state === "spawning") continue;
      const dist = Math.abs(enemy.x - unit.x);
      if (dist < nearestDist) {
        nearestDist = dist;
      }
    }

    if (nearestDist <= unit.attackRange) {
      // In range — stop and attack
      if (unit.state === "walking") {
        unit.state = "attacking";
      }
    } else {
      // Walk toward enemies (right)
      unit.state = "walking";
      unit.x += unit.speed * dtSec;
      // Don't walk too close to the enemy castle — leave space for enemy spawns
      const rightBound = state.config.boardWidthPx - state.config.castleWidthPx - 20;
      if (unit.x > rightBound) unit.x = rightBound;
    }
  }

  // Move enemies → left
  for (const enemy of state.enemies.values()) {
    if (enemy.state === "dying" || enemy.state === "hit" || enemy.state === "spawning") continue;

    // Find nearest player unit by absolute distance
    let nearestDist = Infinity;
    for (const unit of state.playerUnits.values()) {
      if (unit.state === "dying") continue;
      const dist = Math.abs(enemy.x - unit.x);
      if (dist < nearestDist) {
        nearestDist = dist;
      }
    }

    if (nearestDist <= enemy.attackRange) {
      // In range — stop and attack
      if (enemy.state === "walking") {
        enemy.state = "attacking";
      }
    } else {
      // Walk toward player castle (left)
      enemy.state = "walking";
      enemy.x -= enemy.speed * dtSec;
    }
  }

  // Tick spawning timers → transition to walking
  for (const enemy of state.enemies.values()) {
    if (enemy.state === "spawning") {
      enemy.animTimer -= dt;
      if (enemy.animTimer <= 0) {
        enemy.state = "walking";
        enemy.animTimer = 0;
      }
    }
  }
}
