import type { GameState } from "./game-state";
import type { ViewState } from "./types";
import type { SpriteManager } from "./sprite-manager";
import { render } from "./renderer";
import { updateSpawner } from "./systems/spawner";
import { updateEconomy } from "./systems/economy";
import { updateMovement } from "./systems/movement";
import { updateCombat } from "./systems/combat";

export interface GameLoop {
  start(): void;
  stop(): void;
}

export function createGameLoop(
  state: GameState,
  ctx: CanvasRenderingContext2D,
  sprites: SpriteManager,
  onViewUpdate: (view: ViewState) => void,
): GameLoop {
  let lastTime = 0;
  let running = true;
  let prevView: ViewState | null = null;

  function tick(timestamp: number) {
    if (!running) return;

    const dt = lastTime === 0
      ? 0
      : Math.min(timestamp - lastTime, 100); // cap to prevent spiral of death
    lastTime = timestamp;

    if (state.phase === "playing" && dt > 0) {
      // 1. Spawn goblins per wave schedule
      updateSpawner(state, dt);

      // 2. Tick egg-laying timers
      updateEconomy(state, dt);

      // 3. Move goblins, apply knockback
      updateMovement(state, dt);

      // 4. Targeting, damage, projectiles, death
      updateCombat(state, dt);

      // 5. Tick dying timers & cleanup dead entities
      tickDyingTimers(state, dt);
      cleanupDead(state);

      // 6. Check win/loss
      checkWinLoss(state);
    }

    // 7. Render
    render(ctx, state, sprites, dt);

    // 8. Bridge to React (only if changed)
    const view = state.extractView();
    if (!viewsEqual(prevView, view)) {
      prevView = view;
      onViewUpdate(view);
    }

    requestAnimationFrame(tick);
  }

  return {
    start: () => requestAnimationFrame(tick),
    stop: () => { running = false; },
  };
}

// ── Dying timers ────────────────────────────────────────────────────

function tickDyingTimers(state: GameState, dt: number): void {
  for (const animal of state.animals.values()) {
    if (animal.state === "dying") {
      animal.animTimer -= dt;
    }
  }
  for (const goblin of state.goblins.values()) {
    if (goblin.state === "dying") {
      goblin.animTimer -= dt;
    }
  }
}

// ── Cleanup dead entities ───────────────────────────────────────────

function cleanupDead(state: GameState): void {
  const deadAnimals: number[] = [];
  for (const animal of state.animals.values()) {
    if (animal.state === "dying" && animal.animTimer <= 0) {
      deadAnimals.push(animal.id);
    }
  }
  for (const id of deadAnimals) {
    state.removeAnimal(id);
  }

  const deadGoblins: number[] = [];
  for (const goblin of state.goblins.values()) {
    if (goblin.state === "dying" && goblin.animTimer <= 0) {
      deadGoblins.push(goblin.id);
    }
  }
  for (const id of deadGoblins) {
    state.removeGoblin(id);
  }
}

// ── Win/loss check ──────────────────────────────────────────────────

function checkWinLoss(state: GameState): void {
  // Loss: any goblin crosses the left board boundary
  for (const goblin of state.goblins.values()) {
    if (goblin.state === "dying") continue;
    if (goblin.x < 0) {
      state.phase = "lost";
      return;
    }
  }

  // Win: all waves finished spawning and no goblins remain
  if (state.wavesFinished && state.spawnQueue.length === 0 && state.goblins.size === 0) {
    state.phase = "won";
  }
}

// ── View comparison ─────────────────────────────────────────────────

function viewsEqual(a: ViewState | null, b: ViewState): boolean {
  if (!a) return false;
  return (
    a.eggs === b.eggs &&
    a.currentWave === b.currentWave &&
    a.phase === b.phase &&
    a.toolMode.kind === b.toolMode.kind &&
    a.summary === b.summary
  );
}
