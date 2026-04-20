import type { ArenaConfig } from "./types";

export const DEFAULT_CONFIG: ArenaConfig = {
  boardWidthPx: 800,
  boardHeightPx: 200,
  castleWidthPx: 60,
  laneCenterY: 100, // vertical center of the lane

  gameDurationMs: 75_000,

  unitStats: {
    pesak: {
      hp: 60,
      damage: 15,
      speed: 40,
      attackRange: 20,
      attackCooldownMs: 1200,
      splashRadius: 0,
    },
    lucistnik: {
      hp: 40,
      damage: 12,
      speed: 35,
      attackRange: 150,
      attackCooldownMs: 1400,
      splashRadius: 0,
    },
    carodej: {
      hp: 80,
      damage: 25,
      speed: 30,
      attackRange: 200,
      attackCooldownMs: 2000,
      splashRadius: 60,
    },
    obr: {
      hp: 150,
      damage: 20,
      speed: 25,
      attackRange: 25,
      attackCooldownMs: 1800,
      splashRadius: 0,
    },
  },

  enemyStats: {
    hp: 50,
    damage: 10,
    speed: 30,
    attackRange: 15,
    attackCooldownMs: 1000,
  },

  spawnPhases: [
    { afterMs: 0, intervalMs: 4000 },
    { afterMs: 30_000, intervalMs: 3000 },
    { afterMs: 55_000, intervalMs: 2500 },
  ],

  spawningDurationMs: 200,
  dyingDurationMs: 300,
  hitFlashMs: 150,
  spellDurationMs: 400,

  perspective: {
    slots: {
      back: { yOffset: -20, scale: 0.85 },
      mid: { yOffset: 0, scale: 1.0 },
      front: { yOffset: 20, scale: 1.15 },
    },
  },

  question: {
    easySubtypeWeights: { small_mul: 60, add_no_carry: 40 },
    hardSubtypeWeights: { large_mul: 50, add_carry: 50 },
    recentHistorySize: 3,
    maxSameSubtypeStreak: 2,
    factor1Weight: 0.2,
  },
};
