import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../game-state";
import { DEFAULT_CONFIG, FALLBACK_WAVES } from "../config";
import { updateEconomy } from "../systems/economy";
import { colLeftX, colRightX } from "../entities";
import type { GameConfig } from "../types";

function makeConfig(overrides?: Partial<GameConfig>): GameConfig {
  return { ...DEFAULT_CONFIG, waves: FALLBACK_WAVES, ...overrides };
}

describe("placement system", () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState(makeConfig());
  });

  it("cannot place when no eggs", () => {
    expect(state.eggs).toBe(0);
    const result = state.addAnimal("llama", 0, 1);
    expect(result).toBeNull();
  });

  it("can place after collecting an egg", () => {
    // Produce and collect an egg
    updateEconomy(state, DEFAULT_CONFIG.eggLayIntervalMs);
    const chicken = [...state.animals.values()][0];
    state.collectEgg(chicken.id);
    expect(state.eggs).toBe(1);

    const llama = state.addAnimal("llama", 0, 1);
    expect(llama).not.toBeNull();
    expect(state.eggs).toBe(0);
    expect(state.grid[0][1]).toBe(llama!.id);
  });

  it("cannot place in occupied slot", () => {
    // Column 0 has starting chickens
    state.eggs = 5;
    const result = state.addAnimal("llama", 0, 0);
    expect(result).toBeNull();
    expect(state.eggs).toBe(5); // not deducted
  });

  it("cannot place out of bounds", () => {
    state.eggs = 5;
    expect(state.addAnimal("llama", -1, 0)).toBeNull();
    expect(state.addAnimal("llama", 0, 6)).toBeNull();
    expect(state.addAnimal("llama", 3, 0)).toBeNull();
  });

  it("selling frees the slot and returns 1 egg", () => {
    state.eggs = 1;
    const llama = state.addAnimal("llama", 0, 1)!;
    expect(state.eggs).toBe(0);
    expect(state.grid[0][1]).toBe(llama.id);

    const result = state.sellAnimal(llama.id);
    expect(result).toBe(true);
    expect(state.grid[0][1]).toBeNull();
    expect(state.animals.has(llama.id)).toBe(false);
    expect(state.eggs).toBe(1);
  });

  it("selling nonexistent animal returns false", () => {
    expect(state.sellAnimal(9999)).toBe(false);
  });

  describe("placement push", () => {
    it("pushes goblins in the slot to the right boundary", () => {
      state.eggs = 1;
      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";

      // Place goblin inside column 2's pixel range
      const leftX = colLeftX(2, state.config);
      const rightX = colRightX(2, state.config);
      goblin.x = (leftX + rightX) / 2;

      state.addAnimal("ram", 0, 2);

      expect(goblin.x).toBe(rightX);
    });

    it("does not push goblins in different lanes", () => {
      state.eggs = 1;
      const goblin = state.spawnGoblin(1, "basic"); // lane 1
      goblin.state = "walking";

      const leftX = colLeftX(2, state.config);
      const rightX = colRightX(2, state.config);
      goblin.x = (leftX + rightX) / 2;
      const startX = goblin.x;

      state.addAnimal("ram", 0, 2); // lane 0

      expect(goblin.x).toBe(startX); // unchanged
    });

    it("does not push dying goblins", () => {
      state.eggs = 1;
      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "dying";

      const leftX = colLeftX(2, state.config);
      const rightX = colRightX(2, state.config);
      goblin.x = (leftX + rightX) / 2;
      const startX = goblin.x;

      state.addAnimal("ram", 0, 2);
      expect(goblin.x).toBe(startX);
    });
  });
});
