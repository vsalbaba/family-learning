import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../game-state";
import { DEFAULT_CONFIG, FALLBACK_WAVES } from "../config";
import { updateCombat } from "../systems/combat";
import { createAnimal } from "../entities";
import type { GameConfig } from "../types";

function makeConfig(overrides?: Partial<GameConfig>): GameConfig {
  return { ...DEFAULT_CONFIG, waves: FALLBACK_WAVES, ...overrides };
}

function addLlama(
  state: GameState,
  lane: number,
  col: number,
  facing: "left" | "right" = "right",
) {
  const llama = createAnimal("llama", lane, col, state.config);
  llama.facing = facing;
  state.animals.set(llama.id, llama);
  state.grid[lane][col] = llama.id;
  return llama;
}

function addRam(state: GameState, lane: number, col: number) {
  const ram = createAnimal("ram", lane, col, state.config);
  state.animals.set(ram.id, ram);
  state.grid[lane][col] = ram.id;
  return ram;
}

describe("combat system", () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState(makeConfig());
  });

  describe("llama targeting", () => {
    it("llama fires at nearest goblin in facing direction", () => {
      const llama = addLlama(state, 0, 1, "right");
      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";
      goblin.x = 400;

      updateCombat(state, 1); // trigger attack
      expect(state.projectiles.size).toBe(1);

      const proj = [...state.projectiles.values()][0];
      expect(proj.lane).toBe(0);
      expect(proj.dx).toBe(1); // right
      expect(proj.sourceId).toBe(llama.id);
    });

    it("llama does not fire at goblin behind it", () => {
      addLlama(state, 0, 3, "right");
      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";
      goblin.x = 50; // to the left of llama

      updateCombat(state, 1);
      expect(state.projectiles.size).toBe(0);
    });

    it("llama facing left fires at goblin to the left", () => {
      addLlama(state, 0, 3, "left");
      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";
      goblin.x = 50;

      updateCombat(state, 1);
      expect(state.projectiles.size).toBe(1);
      expect([...state.projectiles.values()][0].dx).toBe(-1);
    });

    it("llama enters cooldown after firing", () => {
      const llama = addLlama(state, 0, 1, "right");
      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";
      goblin.x = 400;

      updateCombat(state, 1);
      expect(llama.attackCooldown).toBeGreaterThan(0);

      // Second update during cooldown should not fire again
      updateCombat(state, 100);
      expect(state.projectiles.size).toBe(1); // still just the first one
    });

    it("llama does not target spawning goblins", () => {
      addLlama(state, 0, 1, "right");
      const goblin = state.spawnGoblin(0, "basic");
      expect(goblin.state).toBe("spawning");

      updateCombat(state, 1);
      expect(state.projectiles.size).toBe(0);
    });
  });

  describe("ram targeting", () => {
    it("ram attacks nearest goblin in front within range", () => {
      const ram = addRam(state, 0, 2);
      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";
      // Place goblin just in front of ram (to the right)
      goblin.x = ram.x + 30;

      const startHp = goblin.hp;
      updateCombat(state, 1);

      expect(goblin.hp).toBeLessThan(startHp);
      expect(ram.attackCooldown).toBeGreaterThan(0);
    });

    it("ram applies knockback on hit", () => {
      addRam(state, 0, 2);
      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";
      const ram = [...state.animals.values()].find((a) => a.type === "ram")!;
      goblin.x = ram.x + 30;

      updateCombat(state, 1);

      expect(goblin.knockbackVelocity).toBeGreaterThan(0);
      expect(["knockback", "dying"]).toContain(goblin.state);
    });

    it("ram does not attack goblin behind it", () => {
      addRam(state, 0, 3);
      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";
      goblin.x = 50; // to the left of ram

      const startHp = goblin.hp;
      updateCombat(state, 1);
      expect(goblin.hp).toBe(startHp);
    });
  });

  describe("goblin attacks", () => {
    it("goblin attacks nearest animal ahead in its lane", () => {
      const chicken = [...state.animals.values()].find(
        (a) => a.lane === 0,
      )!;
      const startHp = chicken.hp;

      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";
      goblin.x = chicken.x + goblin.attackRange + 15; // just within range

      updateCombat(state, 1);
      expect(goblin.state).toBe("attacking");
      expect(chicken.hp).toBeLessThan(startHp);
    });

    it("goblin never attacks backward", () => {
      // Remove the chicken from lane 0 col 0
      const chicken0 = [...state.animals.values()].find(
        (a) => a.lane === 0,
      )!;
      state.removeAnimal(chicken0.id);

      // Add a chicken behind the goblin
      const behindChicken = createAnimal("chicken", 0, 4, state.config);
      state.animals.set(behindChicken.id, behindChicken);
      state.grid[0][4] = behindChicken.id;

      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";
      goblin.x = 100; // to the left of the chicken at col 4

      const startHp = behindChicken.hp;
      updateCombat(state, 1);
      expect(behindChicken.hp).toBe(startHp);
    });

    it("goblin resumes walking when target animal dies", () => {
      const chicken = [...state.animals.values()].find(
        (a) => a.lane === 0,
      )!;

      const goblin = state.spawnGoblin(0, "basic");
      goblin.state = "walking";
      goblin.x = chicken.x + goblin.attackRange + 15;

      // Kill the chicken
      chicken.hp = 0;
      chicken.state = "dying";
      chicken.animTimer = 0;

      updateCombat(state, 1);
      expect(goblin.state).toBe("walking");
    });
  });

  describe("projectile hit detection", () => {
    it("projectile damages the first goblin it hits", () => {
      const llama = addLlama(state, 1, 1, "right");
      const goblin1 = state.spawnGoblin(1, "basic");
      goblin1.state = "walking";
      goblin1.x = llama.x + 50;

      const goblin2 = state.spawnGoblin(1, "basic");
      goblin2.state = "walking";
      goblin2.x = llama.x + 200;

      // Fire
      updateCombat(state, 1);
      expect(state.projectiles.size).toBe(1);

      // Advance projectile to reach first goblin
      const proj = [...state.projectiles.values()][0];
      proj.x = goblin1.x; // move projectile to goblin position

      const g1Hp = goblin1.hp;
      const g2Hp = goblin2.hp;
      updateCombat(state, 1);

      expect(goblin1.hp).toBeLessThan(g1Hp);
      expect(goblin2.hp).toBe(g2Hp);
    });
  });
});
