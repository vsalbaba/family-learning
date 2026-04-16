import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../game-state";
import { DEFAULT_CONFIG, FALLBACK_WAVES } from "../config";
import { updateEconomy } from "../systems/economy";
import type { GameConfig } from "../types";

function makeConfig(overrides?: Partial<GameConfig>): GameConfig {
  return { ...DEFAULT_CONFIG, waves: FALLBACK_WAVES, ...overrides };
}

describe("economy system", () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState(makeConfig());
  });

  it("starting chickens begin with egg already laid", () => {
    for (const animal of state.animals.values()) {
      expect(animal.type).toBe("chicken");
      expect(animal.eggReady).toBe(true);
      expect(animal.state).toBe("egg-ready");
    }
  });

  it("chicken produces next egg after collecting and waiting", () => {
    const chicken = [...state.animals.values()][0];
    state.collectEgg(chicken.id);
    expect(chicken.eggReady).toBe(false);

    updateEconomy(state, DEFAULT_CONFIG.eggLayIntervalMs);
    expect(chicken.eggReady).toBe(true);
    expect(chicken.state).toBe("egg-ready");
  });

  it("chicken does not produce egg before interval completes", () => {
    const chicken = [...state.animals.values()][0];
    state.collectEgg(chicken.id);

    updateEconomy(state, DEFAULT_CONFIG.eggLayIntervalMs - 1);
    expect(chicken.eggReady).toBe(false);
  });

  it("collecting egg resets timer and increments egg count", () => {
    updateEconomy(state, DEFAULT_CONFIG.eggLayIntervalMs);
    const chicken = [...state.animals.values()][0];

    const result = state.collectEgg(chicken.id);

    expect(result).toBe(true);
    expect(state.eggs).toBe(1);
    expect(chicken.eggReady).toBe(false);
    expect(chicken.eggTimer).toBe(DEFAULT_CONFIG.eggLayIntervalMs);
    expect(state.stats.eggsCollected).toBe(1);
  });

  it("cannot collect egg when not ready", () => {
    const chicken = [...state.animals.values()][0];
    // Collect the initial egg first
    state.collectEgg(chicken.id);
    expect(chicken.eggReady).toBe(false);

    // Now trying to collect again should fail
    const result = state.collectEgg(chicken.id);
    expect(result).toBe(false);
  });

  it("barn chicken produces egg on its own timer", () => {
    updateEconomy(state, DEFAULT_CONFIG.barnChickenEggIntervalMs);
    expect(state.barnChicken.eggReady).toBe(true);
  });

  it("barn chicken does not produce egg before its interval", () => {
    updateEconomy(state, DEFAULT_CONFIG.barnChickenEggIntervalMs - 1);
    expect(state.barnChicken.eggReady).toBe(false);
  });

  it("collecting barn egg resets timer and increments count", () => {
    updateEconomy(state, DEFAULT_CONFIG.barnChickenEggIntervalMs);
    const result = state.collectBarnEgg();

    expect(result).toBe(true);
    expect(state.eggs).toBe(1);
    expect(state.barnChicken.eggReady).toBe(false);
    expect(state.barnChicken.eggTimer).toBe(DEFAULT_CONFIG.barnChickenEggIntervalMs);
  });

  it("barn chicken egg interval is longer than on-grid chicken", () => {
    expect(DEFAULT_CONFIG.barnChickenEggIntervalMs).toBeGreaterThan(
      DEFAULT_CONFIG.eggLayIntervalMs,
    );
  });
});
