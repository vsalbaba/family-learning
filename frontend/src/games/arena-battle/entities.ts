import type {
  ArenaConfig,
  Enemy,
  EntityId,
  PerspectiveSlot,
  PlayerUnit,
  PlayerUnitType,
  SpellEffect,
} from "./types";

let nextId = 1;

export function genId(): EntityId {
  return nextId++;
}

export function resetIdCounter(): void {
  nextId = 1;
}

const PERSPECTIVE_ORDER: PerspectiveSlot[] = ["back", "mid", "front"];
let perspectiveIndex = 0;

export function nextPerspectiveSlot(): PerspectiveSlot {
  const slot = PERSPECTIVE_ORDER[perspectiveIndex % PERSPECTIVE_ORDER.length];
  perspectiveIndex++;
  return slot;
}

export function resetPerspective(): void {
  perspectiveIndex = 0;
}

export function createPlayerUnit(
  type: PlayerUnitType,
  config: ArenaConfig,
): PlayerUnit {
  const stats = config.unitStats[type];
  return {
    id: genId(),
    type,
    x: config.castleWidthPx + 10,
    y: config.laneCenterY,
    hp: stats.hp,
    maxHp: stats.hp,
    damage: stats.damage,
    speed: stats.speed,
    attackRange: stats.attackRange,
    attackCooldown: 0,
    attackCooldownMax: stats.attackCooldownMs,
    splashRadius: stats.splashRadius,
    state: "walking",
    animTimer: 0,
    targetId: null,
    perspectiveSlot: nextPerspectiveSlot(),
  };
}

export function createEnemy(config: ArenaConfig): Enemy {
  const stats = config.enemyStats;
  return {
    id: genId(),
    x: config.boardWidthPx - config.castleWidthPx - 10,
    y: config.laneCenterY,
    hp: stats.hp,
    maxHp: stats.hp,
    damage: stats.damage,
    speed: stats.speed,
    attackRange: stats.attackRange,
    attackCooldown: 0,
    attackCooldownMax: stats.attackCooldownMs,
    state: "spawning",
    animTimer: config.spawningDurationMs,
    targetId: null,
    hitByArrow: false,
    perspectiveSlot: nextPerspectiveSlot(),
  };
}

export function createSpellEffect(
  x: number,
  y: number,
  config: ArenaConfig,
): SpellEffect {
  return {
    x,
    y,
    timer: config.spellDurationMs,
    duration: config.spellDurationMs,
  };
}
