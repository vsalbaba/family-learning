import type {
  Animal,
  AnimalType,
  BarnChicken,
  GameConfig,
  Goblin,
  Projectile,
  EntityId,
} from "./types";

let nextId = 1;

export function resetIdCounter(): void {
  nextId = 1;
}

export function genId(): EntityId {
  return nextId++;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Pixel center-x for a given column on the playable board. */
export function colCenterX(col: number, config: GameConfig): number {
  const colWidth = config.boardWidthPx / config.colCount;
  return col * colWidth + colWidth / 2;
}

/** Pixel center-y for a given lane. */
export function laneCenterY(lane: number, config: GameConfig): number {
  const laneHeight = config.boardHeightPx / config.laneCount;
  return lane * laneHeight + laneHeight / 2;
}

/** Left x boundary of a column. */
export function colLeftX(col: number, config: GameConfig): number {
  return col * (config.boardWidthPx / config.colCount);
}

/** Right x boundary of a column. */
export function colRightX(col: number, config: GameConfig): number {
  return (col + 1) * (config.boardWidthPx / config.colCount);
}

// ── Factories ───────────────────────────────────────────────────────

export function createAnimal(
  type: AnimalType,
  lane: number,
  col: number,
  config: GameConfig,
): Animal {
  const stats = config.unitStats[type];
  return {
    id: genId(),
    type,
    lane,
    col,
    x: colCenterX(col, config),
    y: laneCenterY(lane, config),
    hp: stats.hp,
    maxHp: stats.hp,
    state: type === "chicken" ? "idle" : "idle",
    animTimer: 0,
    eggReady: false,
    eggTimer: type === "chicken" ? config.eggLayIntervalMs : 0,
    facing: "right",
    attackCooldown: 0,
  };
}

export function createGoblin(
  lane: number,
  goblinType: string,
  config: GameConfig,
): Goblin {
  const stats = config.goblinStats[goblinType];
  const laneHeight = config.boardHeightPx / config.laneCount;
  // Random Y stagger: ±15% of lane height
  const yOffset = (Math.random() - 0.5) * 0.3 * laneHeight;

  return {
    id: genId(),
    goblinType,
    lane,
    x: config.boardWidthPx + 20, // spawn just off the right edge
    y: laneCenterY(lane, config) + yOffset,
    yOffset,
    hp: stats.hp,
    maxHp: stats.hp,
    speed: stats.speed,
    damage: stats.damage,
    attackRange: stats.attackRange,
    attackCooldown: 0,
    attackCooldownMax: stats.attackCooldownMs,
    state: "spawning",
    animTimer: config.spawningDurationMs,
    knockbackVelocity: 0,
    targetId: null,
  };
}

export function createProjectile(
  lane: number,
  x: number,
  y: number,
  dx: number,
  damage: number,
  sourceId: EntityId,
  config: GameConfig,
): Projectile {
  return {
    id: genId(),
    lane,
    x,
    y,
    dx,
    speed: config.projectileSpeed,
    damage,
    sourceId,
    state: "flying",
    animTimer: 0,
  };
}

export function createBarnChicken(config: GameConfig): BarnChicken {
  return {
    eggReady: false,
    eggTimer: config.barnChickenEggIntervalMs,
  };
}
