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

    // Find nearest enemy ahead (to the right)
    let nearestEnemyX = Infinity;
    for (const enemy of state.enemies.values()) {
      if (enemy.state === "dying" || enemy.state === "spawning") continue;
      if (enemy.x > unit.x && enemy.x < nearestEnemyX) {
        nearestEnemyX = enemy.x;
      }
    }

    const distToTarget = nearestEnemyX - unit.x;
    if (distToTarget <= unit.attackRange) {
      // In range — stop and face target
      if (unit.state === "walking") {
        unit.state = "attacking";
      }
    } else {
      // Walk toward enemies
      unit.state = "walking";
      unit.x += unit.speed * dtSec;
      // Don't walk past the right castle
      const rightBound = state.config.boardWidthPx - state.config.castleWidthPx;
      if (unit.x > rightBound) unit.x = rightBound;
    }
  }

  // Move enemies → left
  for (const enemy of state.enemies.values()) {
    if (enemy.state === "dying" || enemy.state === "hit" || enemy.state === "spawning") continue;

    // Find nearest player unit ahead (to the left)
    let nearestUnitX = -Infinity;
    for (const unit of state.playerUnits.values()) {
      if (unit.state === "dying") continue;
      if (unit.x < enemy.x && unit.x > nearestUnitX) {
        nearestUnitX = unit.x;
      }
    }

    const distToTarget = enemy.x - nearestUnitX;
    if (nearestUnitX > -Infinity && distToTarget <= enemy.attackRange) {
      // In range — stop
      if (enemy.state === "walking") {
        enemy.state = "attacking";
      }
    } else {
      // Walk toward player castle
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
