import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../game-state";
import { DEFAULT_CONFIG } from "../config";
import { updateSpawner } from "../systems/spawner";
import type { GameConfig, WaveConfig } from "../types";

function makeConfig(waves: WaveConfig[]): GameConfig {
  return { ...DEFAULT_CONFIG, waves };
}

describe("spawner system", () => {
  const testWaves: WaveConfig[] = [
    {
      waveNumber: 1,
      delayBeforeMs: 1000,
      spawns: [
        { lane: 0, delayMs: 0, goblinType: "basic" },
        { lane: 1, delayMs: 500, goblinType: "basic" },
      ],
    },
    {
      waveNumber: 2,
      delayBeforeMs: 2000,
      spawns: [
        { lane: 2, delayMs: 0, goblinType: "basic" },
      ],
    },
  ];

  let state: GameState;

  beforeEach(() => {
    state = new GameState(makeConfig(testWaves));
  });

  it("does not spawn before first wave delay", () => {
    updateSpawner(state, 999);
    expect(state.goblins.size).toBe(0);
    expect(state.currentWave).toBe(0);
  });

  it("starts wave 1 after delay and spawns first goblin (delayMs=0)", () => {
    // Use small tick to just cross the delay boundary
    updateSpawner(state, 1000);
    expect(state.currentWave).toBe(1);
    // First goblin (delayMs=0) spawns immediately when wave starts
    expect(state.goblins.size).toBeGreaterThanOrEqual(1);

    const goblins = [...state.goblins.values()];
    expect(goblins.some((g) => g.lane === 0)).toBe(true);
  });

  it("spawns staggered goblins with small ticks", () => {
    // Tick past the delay with a small step
    updateSpawner(state, 1001); // wave starts, first goblin (delayMs=0) spawns
    // waveTimer is now 1001, so second goblin (delayMs=500) also spawns

    // With the full dt, both spawn in one tick. Use smaller steps to see staggering:
    const state2 = new GameState(makeConfig(testWaves));
    for (let i = 0; i < 100; i++) updateSpawner(state2, 10); // 1000ms total
    expect(state2.currentWave).toBe(1);
    const countAt1000 = state2.goblins.size;
    expect(countAt1000).toBe(1); // only first goblin (delayMs=0)

    for (let i = 0; i < 50; i++) updateSpawner(state2, 10); // +500ms = 1500ms
    expect(state2.goblins.size).toBe(2); // second goblin (delayMs=500) now spawned
  });

  it("advances to wave 2 after delay", () => {
    // Complete wave 1 with small ticks
    for (let i = 0; i < 200; i++) updateSpawner(state, 10); // 2000ms
    expect(state.currentWave).toBe(1);
    expect(state.goblins.size).toBe(2);

    // Wait for wave 2 delay (2000ms)
    for (let i = 0; i < 200; i++) updateSpawner(state, 10); // another 2000ms
    expect(state.currentWave).toBe(2);
    expect(state.goblins.size).toBe(3);
  });

  it("sets wavesFinished after last wave spawns", () => {
    // Tick enough to complete all waves
    for (let i = 0; i < 1000; i++) updateSpawner(state, 10);
    expect(state.wavesFinished).toBe(true);
    expect(state.currentWave).toBe(2);
  });

  it("goblins have Y stagger offsets within lane bounds", () => {
    for (let i = 0; i < 200; i++) updateSpawner(state, 10);
    const goblins = [...state.goblins.values()];
    expect(goblins.length).toBeGreaterThan(0);

    for (const g of goblins) {
      const laneHeight = state.config.boardHeightPx / state.config.laneCount;
      expect(Math.abs(g.yOffset)).toBeLessThanOrEqual(0.15 * laneHeight);
    }
  });
});
