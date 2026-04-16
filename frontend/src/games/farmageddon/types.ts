// ── Identity ────────────────────────────────────────────────────────

export type EntityId = number;

// ── Unit & tool types ───────────────────────────────────────────────

export type AnimalType = "chicken" | "llama" | "ram";

export type Facing = "left" | "right";

export type ToolMode =
  | { kind: "idle" }
  | { kind: "place"; unitType: AnimalType }
  | { kind: "sell" };

// ── Game phase ──────────────────────────────────────────────────────

export type GamePhase = "playing" | "won" | "lost";

// ── Animal states ───────────────────────────────────────────────────

export type AnimalState =
  | "idle"
  | "egg-ready"   // chicken only
  | "attacking"
  | "cooldown"    // llama / ram recovery
  | "hit"
  | "dying";

// ── Goblin states ───────────────────────────────────────────────────

export type GoblinState =
  | "spawning"    // entrance animation, not yet targetable
  | "walking"
  | "attacking"
  | "knockback"
  | "dying";

// ── Entities ────────────────────────────────────────────────────────

export interface Animal {
  id: EntityId;
  type: AnimalType;
  lane: number;
  col: number;
  x: number;          // pixel center x on the playable board
  y: number;          // pixel center y on the playable board
  hp: number;
  maxHp: number;
  state: AnimalState;
  animTimer: number;  // ms remaining in current anim state

  // chicken economy
  eggReady: boolean;
  eggTimer: number;   // ms until next egg ready

  // llama facing
  facing: Facing;

  // attack cooldown (llama & ram)
  attackCooldown: number; // ms until next attack allowed
}

export interface Goblin {
  id: EntityId;
  goblinType: string;     // "basic" for now, extensible
  lane: number;
  x: number;              // continuous pixel x on playable board
  y: number;              // pixel y (lane center + small stagger offset)
  yOffset: number;        // random Y stagger within lane (visual only)
  hp: number;
  maxHp: number;
  speed: number;          // px/s
  damage: number;
  attackRange: number;    // px
  attackCooldown: number; // ms until next attack
  attackCooldownMax: number;
  state: GoblinState;
  animTimer: number;
  knockbackVelocity: number; // px/s, decays over time
  targetId: EntityId | null; // currently targeted animal
}

export type ProjectileState = "flying" | "hit";

export interface Projectile {
  id: EntityId;
  lane: number;
  x: number;
  y: number;
  dx: number;       // -1 (left) or +1 (right)
  speed: number;    // px/s
  damage: number;
  sourceId: EntityId;
  state: ProjectileState;
  animTimer: number; // ms elapsed in current state
}

// ── Barn chicken (off-grid, invulnerable) ───────────────────────────

export interface BarnChicken {
  eggReady: boolean;
  eggTimer: number; // ms until next egg ready
}

// ── Configuration ───────────────────────────────────────────────────

export interface UnitStatBlock {
  hp: number;
  damage: number;
  attackRangeCols: number;  // 0 for chicken, Infinity for llama, 1 for ram
  attackCooldownMs: number;
  knockbackPx: number;      // ram only
}

export interface GoblinStatBlock {
  hp: number;
  speed: number;             // px/s
  damage: number;
  attackCooldownMs: number;
  attackRange: number;       // px
}

export interface GameConfig {
  laneCount: number;
  colCount: number;
  boardWidthPx: number;     // playable board only (excludes barn area)
  boardHeightPx: number;
  barnWidthPx: number;      // barn area to the left
  unitCosts: Record<AnimalType, number>;
  unitStats: Record<AnimalType, UnitStatBlock>;
  goblinStats: Record<string, GoblinStatBlock>;
  eggLayIntervalMs: number;
  barnChickenEggIntervalMs: number;
  projectileSpeed: number;  // px/s
  knockbackDecay: number;   // px/s² deceleration
  spawningDurationMs: number;
  dyingDurationMs: number;
  hitFlashMs: number;
  projectileHitMs: number;  // duration of spit splat animation
  waves: WaveConfig[];
}

// ── Waves ───────────────────────────────────────────────────────────

export interface WaveConfig {
  waveNumber: number;
  delayBeforeMs: number;    // delay before this wave starts
  spawns: SpawnEntry[];
}

export interface SpawnEntry {
  lane: number;
  delayMs: number;          // delay from wave start
  goblinType: string;
}

// ── View state (React bridge) ───────────────────────────────────────

export interface ViewState {
  eggs: number;
  currentWave: number;
  totalWaves: number;
  phase: GamePhase;
  toolMode: ToolMode;
  summary: GameSummary | null;
}

export interface GameSummary {
  result: "won" | "lost";
  eggsCollected: number;
  goblinsKilled: number;
  animalsLost: number;
  wavesCompleted: number;
  totalWaves: number;
}
