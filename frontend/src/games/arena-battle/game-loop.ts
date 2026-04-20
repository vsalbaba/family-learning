import type { ArenaGameState } from "./game-state";
import type { ArenaViewState } from "./types";
import type { ArenaSpriteManager } from "./sprite-manager";
import { render } from "./renderer";
import { updateEnemySpawner } from "./systems/enemy-spawner";
import { updateMovement } from "./systems/movement";
import { updateCombat } from "./systems/combat";

export interface ArenaGameLoop {
  start(): void;
  stop(): void;
}

const VIEW_SYNC_INTERVAL_MS = 100;

export function createArenaGameLoop(
  state: ArenaGameState,
  ctx: CanvasRenderingContext2D,
  sprites: ArenaSpriteManager,
  onViewUpdate: (view: ArenaViewState) => void,
): ArenaGameLoop {
  let lastTime = 0;
  let running = true;
  let prevView: ArenaViewState | null = null;
  let viewSyncTimer = 0;

  function tick(timestamp: number) {
    if (!running) return;

    const dt = lastTime === 0
      ? 0
      : Math.min(timestamp - lastTime, 100);
    lastTime = timestamp;

    if (state.phase === "playing" && dt > 0) {
      // 1. Timer countdown
      updateTimer(state, dt);

      // 2. Spawn enemies
      updateEnemySpawner(state, dt);

      // 3. Move all units
      updateMovement(state, dt);

      // 4. Combat
      updateCombat(state, dt);

      // 5. Dying timers & cleanup
      tickDyingTimers(state, dt);
      cleanupDead(state);

      // 6. Win/loss check
      checkWinLoss(state);
    }

    // 7. Render
    render(ctx, state, sprites, dt);

    // 8. Throttled view sync
    viewSyncTimer -= dt;
    if (viewSyncTimer <= 0) {
      syncView();
      viewSyncTimer = VIEW_SYNC_INTERVAL_MS;
    }

    requestAnimationFrame(tick);
  }

  function syncView() {
    const view = state.extractView();
    if (!viewsEqual(prevView, view)) {
      prevView = view;
      onViewUpdate(view);
    }
  }

  /** Force immediate view sync (call after state changes like spawn, phase change) */
  function forceSyncView() {
    viewSyncTimer = 0; // will sync on next frame
  }

  // Expose forceSyncView on state for external callers (QuestionPanel → spawnUnit)
  (state as ArenaGameState & { _forceSyncView?: () => void })._forceSyncView = forceSyncView;

  return {
    start: () => requestAnimationFrame(tick),
    stop: () => { running = false; },
  };
}

// ── Timer ───────────────────────────────────────────────────────────

function updateTimer(state: ArenaGameState, dt: number): void {
  state.remainingMs -= dt;
  if (state.remainingMs <= 0) {
    state.remainingMs = 0;
    state.phase = "won";
  }
}

// ── Dying timers ────────────────────────────────────────────────────

function tickDyingTimers(state: ArenaGameState, dt: number): void {
  for (const unit of state.playerUnits.values()) {
    if (unit.state === "dying") {
      unit.animTimer -= dt;
    }
  }
  for (const enemy of state.enemies.values()) {
    if (enemy.state === "dying") {
      enemy.animTimer -= dt;
    }
  }
  // Tick spell effects
  state.spellEffects = state.spellEffects.filter((e) => {
    e.timer -= dt;
    return e.timer > 0;
  });
}

// ── Cleanup dead ────────────────────────────────────────────────────

function cleanupDead(state: ArenaGameState): void {
  for (const unit of state.playerUnits.values()) {
    if (unit.state === "dying" && unit.animTimer <= 0) {
      state.removePlayerUnit(unit.id);
    }
  }
  for (const enemy of state.enemies.values()) {
    if (enemy.state === "dying" && enemy.animTimer <= 0) {
      state.removeEnemy(enemy.id);
    }
  }
}

// ── Win/loss check ──────────────────────────────────────────────────

function checkWinLoss(state: ArenaGameState): void {
  // Loss: any non-dying enemy reaches the player castle
  const castleRight = state.config.castleWidthPx;
  for (const enemy of state.enemies.values()) {
    if (enemy.state === "dying") continue;
    if (enemy.x <= castleRight) {
      state.phase = "lost";
      return;
    }
  }
}

// ── View comparison ─────────────────────────────────────────────────

function viewsEqual(a: ArenaViewState | null, b: ArenaViewState): boolean {
  if (!a) return false;
  return (
    a.remainingSeconds === b.remainingSeconds &&
    a.phase === b.phase &&
    a.stats.unitsSpawned === b.stats.unitsSpawned &&
    a.stats.enemiesKilled === b.stats.enemiesKilled &&
    a.stats.easyAnswered === b.stats.easyAnswered &&
    a.stats.hardAnswered === b.stats.hardAnswered &&
    a.summary === b.summary
  );
}
