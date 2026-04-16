import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../game-state";
import { DEFAULT_CONFIG, FALLBACK_WAVES } from "../config";
import { updateMovement } from "../systems/movement";
import type { GameConfig } from "../types";

function makeConfig(overrides?: Partial<GameConfig>): GameConfig {
  return { ...DEFAULT_CONFIG, waves: FALLBACK_WAVES, ...overrides };
}

describe("movement system", () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState(makeConfig());
  });

  it("spawning goblin transitions to walking after spawningDurationMs", () => {
    const goblin = state.spawnGoblin(0, "basic");
    expect(goblin.state).toBe("spawning");

    updateMovement(state, DEFAULT_CONFIG.spawningDurationMs);
    expect(goblin.state).toBe("walking");
  });

  it("spawning goblin does not move", () => {
    const goblin = state.spawnGoblin(0, "basic");
    const startX = goblin.x;

    updateMovement(state, DEFAULT_CONFIG.spawningDurationMs - 1);
    expect(goblin.x).toBe(startX);
  });

  it("walking goblin moves left", () => {
    const goblin = state.spawnGoblin(0, "basic");
    goblin.state = "walking";
    goblin.animTimer = 0;
    const startX = goblin.x;

    updateMovement(state, 1000);
    expect(goblin.x).toBeLessThan(startX);
    expect(goblin.x).toBeCloseTo(startX - goblin.speed, 1);
  });

  it("attacking goblin does not move", () => {
    const goblin = state.spawnGoblin(0, "basic");
    goblin.state = "attacking";
    const startX = goblin.x;

    updateMovement(state, 1000);
    expect(goblin.x).toBe(startX);
  });

  it("knockback pushes goblin right and decays", () => {
    const goblin = state.spawnGoblin(0, "basic");
    goblin.state = "knockback";
    goblin.knockbackVelocity = 200;
    goblin.x = 300; // place in middle of board so there's room to move right
    const startX = goblin.x;

    updateMovement(state, 100); // 0.1s
    expect(goblin.x).toBeGreaterThan(startX);

    // After enough time, knockback finishes and state returns to walking
    for (let i = 0; i < 20; i++) {
      updateMovement(state, 100);
    }
    expect(goblin.state).toBe("walking");
    expect(goblin.knockbackVelocity).toBe(0);
  });

  it("knockback clamps goblin within board bounds", () => {
    const goblin = state.spawnGoblin(0, "basic");
    goblin.state = "knockback";
    goblin.knockbackVelocity = 10000; // extremely high
    goblin.x = state.config.boardWidthPx;

    updateMovement(state, 1000);
    expect(goblin.x).toBeLessThanOrEqual(state.config.boardWidthPx + 20);
  });
});
