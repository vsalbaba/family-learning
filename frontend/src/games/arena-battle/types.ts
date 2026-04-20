// ── Identity ────────────────────────────────────────────────────────

export type EntityId = number;

// ── Unit types ──────────────────────────────────────────────────────

export type PlayerUnitType = "pesak" | "lucistnik" | "carodej" | "obr";
export type Tier = "easy" | "hard";
export type PerspectiveSlot = "back" | "mid" | "front";

// ── Game phase ──────────────────────────────────────────────────────

export type GamePhase = "playing" | "won" | "lost";

// ── Entity states ───────────────────────────────────────────────────

export type PlayerUnitState = "walking" | "attacking" | "hit" | "dying";
export type EnemyState = "spawning" | "walking" | "attacking" | "hit" | "dying";

// ── Entities ────────────────────────────────────────────────────────

export interface PlayerUnit {
  id: EntityId;
  type: PlayerUnitType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  attackRange: number;
  attackCooldown: number;
  attackCooldownMax: number;
  splashRadius: number; // > 0 only for carodej
  state: PlayerUnitState;
  animTimer: number;
  targetId: EntityId | null;
  perspectiveSlot: PerspectiveSlot;
}

export interface Enemy {
  id: EntityId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  attackRange: number;
  attackCooldown: number;
  attackCooldownMax: number;
  state: EnemyState;
  animTimer: number;
  targetId: EntityId | null;
  hitByArrow: boolean;
  perspectiveSlot: PerspectiveSlot;
}

export interface SpellEffect {
  x: number;
  y: number;
  timer: number;
  duration: number;
}

// ── Questions ───────────────────────────────────────────────────────

export type QuestionSubtype =
  | "small_mul"
  | "add_no_carry"
  | "large_mul"
  | "add_carry";

export interface MathQuestion {
  key: string; // "mul:3:7" or "add:37:8"
  text: string; // "3 × 7 =" or "37 + 8 ="
  correctAnswer: number;
  wrongAnswer: number;
  tier: Tier;
  subtype: QuestionSubtype;
}

export interface TaskPair {
  easy: MathQuestion;
  hard: MathQuestion;
}

// ── Configuration ───────────────────────────────────────────────────

export interface UnitStatBlock {
  hp: number;
  damage: number;
  speed: number;
  attackRange: number;
  attackCooldownMs: number;
  splashRadius: number;
}

export interface EnemyStatBlock {
  hp: number;
  damage: number;
  speed: number;
  attackRange: number;
  attackCooldownMs: number;
}

export interface SpawnPhase {
  afterMs: number; // elapsed time when this phase starts
  intervalMs: number; // pause between bursts during this phase
}

export interface BurstConfig {
  minSize: number; // minimum enemies per burst
  maxSize: number; // maximum enemies per burst
  delayMs: number; // delay between enemies within a burst
}

export interface PerspectiveConfig {
  slots: Record<PerspectiveSlot, { yOffset: number; scale: number }>;
}

export interface QuestionConfig {
  easySubtypeWeights: { small_mul: number; add_no_carry: number };
  hardSubtypeWeights: { large_mul: number; add_carry: number };
  recentHistorySize: number;
  maxSameSubtypeStreak: number;
  factor1Weight: number; // weight for multiplication examples with factor 1 (0-1, lower = less frequent)
}

export interface ArenaConfig {
  boardWidthPx: number;
  boardHeightPx: number;
  castleWidthPx: number;
  laneCenterY: number;

  gameDurationMs: number;

  unitStats: Record<PlayerUnitType, UnitStatBlock>;
  enemyStats: EnemyStatBlock;

  spawnPhases: SpawnPhase[];
  burst: BurstConfig;
  spawningDurationMs: number;
  dyingDurationMs: number;
  hitFlashMs: number;
  spellDurationMs: number;

  perspective: PerspectiveConfig;
  question: QuestionConfig;
}

// ── View state (React bridge) ───────────────────────────────────────

export interface GameStats {
  easyAnswered: number;
  easyCorrect: number;
  hardAnswered: number;
  hardCorrect: number;
  unitsSpawned: number;
  enemiesKilled: number;
}

export interface ArenaSummary {
  result: "won" | "lost";
  stats: GameStats;
  durationMs: number;
}

export interface ArenaViewState {
  remainingSeconds: number;
  phase: GamePhase;
  stats: GameStats;
  summary: ArenaSummary | null;
}
