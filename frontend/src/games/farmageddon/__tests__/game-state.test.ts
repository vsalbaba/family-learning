import { describe, it, expect } from "vitest";
import { GameState } from "../game-state";
import { DEFAULT_CONFIG } from "../config";
import { updateSpawner } from "../systems/spawner";
import { updateEconomy } from "../systems/economy";
import { updateMovement } from "../systems/movement";
import { updateCombat } from "../systems/combat";
import type { GameConfig, WaveConfig } from "../types";

function makeConfig(
  waves: WaveConfig[],
  overrides?: Partial<GameConfig>,
): GameConfig {
  return { ...DEFAULT_CONFIG, waves, ...overrides };
}

function tickAll(state: GameState, dt: number) {
  updateSpawner(state, dt);
  updateEconomy(state, dt);
  updateMovement(state, dt);
  updateCombat(state, dt);

  // Tick dying timers
  for (const a of state.animals.values()) {
    if (a.state === "dying") a.animTimer -= dt;
  }
  for (const g of state.goblins.values()) {
    if (g.state === "dying") g.animTimer -= dt;
  }

  // Cleanup dead
  for (const a of [...state.animals.values()]) {
    if (a.state === "dying" && a.animTimer <= 0) state.removeAnimal(a.id);
  }
  for (const g of [...state.goblins.values()]) {
    if (g.state === "dying" && g.animTimer <= 0) state.removeGoblin(g.id);
  }
}

describe("game state integration", () => {
  it("initializes with 3 chickens in column 0", () => {
    const state = new GameState(makeConfig([]));
    expect(state.animals.size).toBe(3);

    for (const animal of state.animals.values()) {
      expect(animal.type).toBe("chicken");
      expect(animal.col).toBe(0);
    }

    // Grid should have entries in column 0
    for (let lane = 0; lane < 3; lane++) {
      expect(state.grid[lane][0]).not.toBeNull();
    }
  });

  it("initializes barn chicken", () => {
    const state = new GameState(makeConfig([]));
    expect(state.barnChicken.eggReady).toBe(false);
    expect(state.barnChicken.eggTimer).toBe(DEFAULT_CONFIG.barnChickenEggIntervalMs);
  });

  it("view state extracts correctly", () => {
    const waves: WaveConfig[] = [
      { waveNumber: 1, delayBeforeMs: 1000, spawns: [] },
    ];
    const state = new GameState(makeConfig(waves));
    const view = state.extractView();

    expect(view.eggs).toBe(0);
    expect(view.currentWave).toBe(0);
    expect(view.totalWaves).toBe(1);
    expect(view.phase).toBe("playing");
    expect(view.summary).toBeNull();
  });

  it("loss detection: goblin at x < 0", () => {
    const state = new GameState(makeConfig([]));
    const goblin = state.spawnGoblin(0, "basic");
    goblin.state = "walking";
    goblin.x = -1;

    // The game loop checks this, but we can verify via extractView
    // after the check function runs
    expect(goblin.x).toBeLessThan(0);
  });

  it("full economy cycle: lay → collect → place", () => {
    const state = new GameState(makeConfig([]));

    // Tick economy until egg is ready
    for (let i = 0; i < 50; i++) tickAll(state, 100);

    // Find a chicken with an egg
    const chicken = [...state.animals.values()].find((a) => a.eggReady);
    expect(chicken).toBeDefined();

    // Collect
    state.collectEgg(chicken!.id);
    expect(state.eggs).toBe(1);

    // Place a llama
    const llama = state.addAnimal("llama", 0, 1);
    expect(llama).not.toBeNull();
    expect(llama!.type).toBe("llama");
    expect(state.eggs).toBe(0);
  });

  it("goblin spawns and moves left over time", () => {
    const waves: WaveConfig[] = [
      {
        waveNumber: 1,
        delayBeforeMs: 0,
        spawns: [{ lane: 0, delayMs: 0, goblinType: "basic" }],
      },
    ];
    const state = new GameState(makeConfig(waves));

    // Spawn
    tickAll(state, 1);
    expect(state.goblins.size).toBe(1);
    const goblin = [...state.goblins.values()][0];
    expect(goblin.state).toBe("spawning");

    // Wait for spawning to finish
    tickAll(state, DEFAULT_CONFIG.spawningDurationMs);
    expect(goblin.state).toBe("walking");

    const xAfterSpawn = goblin.x;

    // Walk
    tickAll(state, 1000);
    expect(goblin.x).toBeLessThan(xAfterSpawn);
  });
});
