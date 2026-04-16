import type { GameConfig } from "./types";

export const DEFAULT_CONFIG: GameConfig = {
  laneCount: 3,
  colCount: 6,
  boardWidthPx: 720,
  boardHeightPx: 360,
  barnWidthPx: 80,

  unitCosts: { chicken: 1, llama: 1, ram: 1 },

  unitStats: {
    chicken: {
      hp: 50,
      damage: 0,
      attackRangeCols: 0,
      attackCooldownMs: 0,
      knockbackPx: 0,
    },
    llama: {
      hp: 100,
      damage: 20,
      attackRangeCols: Infinity,
      attackCooldownMs: 2000,
      knockbackPx: 0,
    },
    ram: {
      hp: 200,
      damage: 15,
      attackRangeCols: 1,
      attackCooldownMs: 1500,
      knockbackPx: 80,
    },
  },

  goblinStats: {
    basic: {
      hp: 80,
      speed: 30,
      damage: 10,
      attackCooldownMs: 1000,
      attackRange: 10,
    },
  },

  eggLayIntervalMs: 5000,
  barnChickenEggIntervalMs: 7000,
  projectileSpeed: 200,
  knockbackDecay: 300,
  spawningDurationMs: 200,
  dyingDurationMs: 300,
  hitFlashMs: 150,
  projectileHitMs: 180,

  waves: [],   // loaded from backend; fallback below
};

/** Fallback waves when backend is unreachable. */
export const FALLBACK_WAVES = [
  {
    waveNumber: 1,
    delayBeforeMs: 3000,
    spawns: [
      { lane: 1, delayMs: 0, goblinType: "basic" },
      { lane: 0, delayMs: 1500, goblinType: "basic" },
    ],
  },
  {
    waveNumber: 2,
    delayBeforeMs: 5000,
    spawns: [
      { lane: 0, delayMs: 0, goblinType: "basic" },
      { lane: 2, delayMs: 500, goblinType: "basic" },
      { lane: 1, delayMs: 1200, goblinType: "basic" },
    ],
  },
  {
    waveNumber: 3,
    delayBeforeMs: 5000,
    spawns: [
      { lane: 0, delayMs: 0, goblinType: "basic" },
      { lane: 1, delayMs: 400, goblinType: "basic" },
      { lane: 2, delayMs: 800, goblinType: "basic" },
      { lane: 0, delayMs: 1600, goblinType: "basic" },
    ],
  },
  {
    waveNumber: 4,
    delayBeforeMs: 6000,
    spawns: [
      { lane: 0, delayMs: 0, goblinType: "basic" },
      { lane: 1, delayMs: 300, goblinType: "basic" },
      { lane: 2, delayMs: 600, goblinType: "basic" },
      { lane: 1, delayMs: 1200, goblinType: "basic" },
      { lane: 0, delayMs: 1800, goblinType: "basic" },
    ],
  },
  {
    waveNumber: 5,
    delayBeforeMs: 6000,
    spawns: [
      { lane: 0, delayMs: 0, goblinType: "basic" },
      { lane: 1, delayMs: 200, goblinType: "basic" },
      { lane: 2, delayMs: 400, goblinType: "basic" },
      { lane: 0, delayMs: 1000, goblinType: "basic" },
      { lane: 1, delayMs: 1400, goblinType: "basic" },
      { lane: 2, delayMs: 1800, goblinType: "basic" },
    ],
  },
];
