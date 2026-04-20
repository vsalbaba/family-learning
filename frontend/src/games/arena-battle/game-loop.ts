import type { ArenaGameState } from "./game-state";
import type { ArenaViewState } from "./types";
import { render } from "./renderer";

export interface ArenaGameLoop {
  start(): void;
  stop(): void;
}

const VIEW_SYNC_INTERVAL_MS = 100;

export function createArenaGameLoop(
  state: ArenaGameState,
  ctx: CanvasRenderingContext2D,
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

      // 2-6. Systems will be added in M3/M4
      // updateEnemySpawner(state, dt);
      // updateMovement(state, dt);
      // updateCombat(state, dt);
      // tickDyingTimers(state, dt);
      // cleanupDead(state);
      // checkWinLoss(state);
    }

    // 7. Render
    render(ctx, state, dt);

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
