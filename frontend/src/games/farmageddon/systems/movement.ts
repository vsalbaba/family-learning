import type { GameState } from "../game-state";

export function updateMovement(state: GameState, dt: number): void {
  const dtSec = dt / 1000;

  for (const goblin of state.goblins.values()) {
    // Spawning: just tick down the anim timer
    if (goblin.state === "spawning") {
      goblin.animTimer -= dt;
      if (goblin.animTimer <= 0) {
        goblin.state = "walking";
        goblin.animTimer = 0;
      }
      continue;
    }

    // Dying: tick down, handled by cleanup
    if (goblin.state === "dying") continue;

    // Knockback: slide right (overrides normal movement)
    if (goblin.state === "knockback") {
      if (goblin.knockbackVelocity > 0) {
        goblin.x += goblin.knockbackVelocity * dtSec;
        goblin.knockbackVelocity = Math.max(
          0,
          goblin.knockbackVelocity - state.config.knockbackDecay * dtSec,
        );
        // Clamp to board
        goblin.x = Math.min(goblin.x, state.config.boardWidthPx + 20);
      }
      if (goblin.knockbackVelocity <= 0) {
        goblin.state = "walking";
        goblin.knockbackVelocity = 0;
        goblin.targetId = null; // retarget
      }
      continue;
    }

    // Attacking: don't move
    if (goblin.state === "attacking") continue;

    // Walking: move left
    if (goblin.state === "walking") {
      goblin.x -= goblin.speed * dtSec;
    }
  }
}
