import type { ArenaGameState } from "./game-state";
import type {
  ArenaConfig,
  Enemy,
  PerspectiveSlot,
  PlayerUnit,
  SpellEffect,
} from "./types";
import type { ArenaSpriteManager } from "./sprite-manager";
import { playerSpriteState, enemySpriteState } from "./sprite-manager";

// ── Colors (fallback when sprites not loaded) ───────────────────────

const COLORS = {
  background: "#d4e6b5",
  laneLine: "#b8d494",
  playerCastle: "#4a7ab5",
  playerCastleRoof: "#3a6295",
  enemyCastle: "#b54a4a",
  enemyCastleRoof: "#953a3a",
  pesak: "#4a8ab5",
  lucistnik: "#5aaa5a",
  carodej: "#9a5ab5",
  obr: "#8a6a3a",
  enemy: "#c44a4a",
  enemySpawning: "rgba(196,74,74,0.5)",
  hitFlash: "rgba(255,0,0,0.5)",
  spellEffect: "rgba(255,220,60,0.6)",
};

const UNIT_EMOJI: Record<string, string> = {
  pesak: "🗡",
  lucistnik: "🏹",
  carodej: "🧙",
  obr: "👹",
};

const ENEMY_EMOJI: Record<string, string> = {
  "enemy-skeleton": "💀",
  "enemy-orc": "👺",
  "enemy-bat": "🦇",
};

const UNIT_COLOR: Record<string, string> = {
  pesak: COLORS.pesak,
  lucistnik: COLORS.lucistnik,
  carodej: COLORS.carodej,
  obr: COLORS.obr,
};

const BASE_UNIT_RADIUS = 42;

/** Per-unit scale multiplier to compensate for different sprite densities. */
const UNIT_SCALE: Record<string, number> = {
  obr: 1.8,
};

const SLOT_ORDER: PerspectiveSlot[] = ["back", "mid", "front"];

let globalTimer = 0;

// ── Red tint overlay for hit state ──────────────────────────────────

function drawRedTint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#ff0000";
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Main render ─────────────────────────────────────────────────────

export function render(
  ctx: CanvasRenderingContext2D,
  state: ArenaGameState,
  sprites: ArenaSpriteManager,
  dt: number,
): void {
  globalTimer += dt;
  const { config } = state;

  ctx.clearRect(0, 0, config.boardWidthPx, config.boardHeightPx);

  drawBackground(ctx, config);
  drawCastles(ctx, config);
  drawSpellEffects(ctx, state, sprites);
  drawEntitiesSorted(ctx, state, sprites);
}

// ── Background ──────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, config: ArenaConfig): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, config.boardWidthPx, config.boardHeightPx);
}

// ── Castles ─────────────────────────────────────────────────────────

function drawCastles(ctx: CanvasRenderingContext2D, config: ArenaConfig): void {
  const h = config.boardHeightPx;
  const cw = config.castleWidthPx;

  ctx.fillStyle = COLORS.playerCastle;
  ctx.fillRect(0, 0, cw, h);
  ctx.fillStyle = COLORS.playerCastleRoof;
  ctx.fillRect(0, 0, cw, 12);
  ctx.fillRect(0, h - 12, cw, 12);

  ctx.fillStyle = COLORS.enemyCastle;
  ctx.fillRect(config.boardWidthPx - cw, 0, cw, h);
  ctx.fillStyle = COLORS.enemyCastleRoof;
  ctx.fillRect(config.boardWidthPx - cw, 0, cw, 12);
  ctx.fillRect(config.boardWidthPx - cw, h - 12, cw, 12);
}

// ── Spell effects ───────────────────────────────────────────────────

function drawSpellEffects(
  ctx: CanvasRenderingContext2D,
  state: ArenaGameState,
  sprites: ArenaSpriteManager,
): void {
  for (const effect of state.spellEffects) {
    const elapsed = effect.duration - effect.timer;
    const size = 48;
    if (
      sprites.hasSprite("spell") &&
      sprites.draw(ctx, "spell", "cast", elapsed, effect.x, effect.y, size, size)
    ) {
      continue;
    }
    // Fallback
    drawSpellEffectFallback(ctx, effect);
  }
}

function drawSpellEffectFallback(
  ctx: CanvasRenderingContext2D,
  effect: SpellEffect,
): void {
  const alpha = effect.timer / effect.duration;
  ctx.save();
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = COLORS.spellEffect;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Sorted entity drawing ───────────────────────────────────────────

function drawEntitiesSorted(
  ctx: CanvasRenderingContext2D,
  state: ArenaGameState,
  sprites: ArenaSpriteManager,
): void {
  const { config } = state;

  type DrawEntry = {
    slot: PerspectiveSlot;
    x: number;
    draw: () => void;
  };

  const entries: DrawEntry[] = [];

  for (const unit of state.playerUnits.values()) {
    entries.push({
      slot: unit.perspectiveSlot,
      x: unit.x,
      draw: () => drawPlayerUnit(ctx, unit, config, sprites),
    });
  }

  for (const enemy of state.enemies.values()) {
    entries.push({
      slot: enemy.perspectiveSlot,
      x: enemy.x,
      draw: () => drawEnemy(ctx, enemy, config, sprites),
    });
  }

  entries.sort((a, b) => {
    const slotA = SLOT_ORDER.indexOf(a.slot);
    const slotB = SLOT_ORDER.indexOf(b.slot);
    if (slotA !== slotB) return slotA - slotB;
    return a.x - b.x;
  });

  for (const entry of entries) {
    entry.draw();
  }
}

// ── Player unit ─────────────────────────────────────────────────────

function drawPlayerUnit(
  ctx: CanvasRenderingContext2D,
  unit: PlayerUnit,
  config: ArenaConfig,
  sprites: ArenaSpriteManager,
): void {
  const perspective = config.perspective.slots[unit.perspectiveSlot];
  const drawY = unit.y + perspective.yOffset;
  const unitScale = UNIT_SCALE[unit.type] ?? 1;
  const scale = perspective.scale * unitScale;
  const size = BASE_UNIT_RADIUS * 2 * scale;

  ctx.save();

  if (unit.state === "dying") {
    ctx.globalAlpha = Math.max(0, unit.animTimer / config.dyingDurationMs);
  }

  // For hit state, render as walking + red tint overlay (no hit sprite needed)
  const visualState = unit.state === "hit" ? "walking" : unit.state;
  const spriteState = playerSpriteState(visualState);
  let spriteTimer = globalTimer;
  if (unit.state === "dying") spriteTimer = config.dyingDurationMs - unit.animTimer;
  else if (unit.state === "attacking") spriteTimer = unit.attackCooldownMax - unit.attackCooldown;

  if (
    sprites.hasSprite(unit.type) &&
    sprites.draw(ctx, unit.type, spriteState, spriteTimer, unit.x, drawY, size, size)
  ) {
    if (unit.state === "hit") {
      drawRedTint(ctx, unit.x, drawY, size);
    }
    ctx.restore();
    return;
  }

  // Fallback: colored circle + emoji
  const radius = BASE_UNIT_RADIUS * scale;

  ctx.fillStyle = UNIT_COLOR[unit.type] ?? COLORS.pesak;
  ctx.beginPath();
  ctx.arc(unit.x, drawY, radius, 0, Math.PI * 2);
  ctx.fill();

  if (unit.state === "hit") {
    drawRedTint(ctx, unit.x, drawY, radius * 2);
  }

  ctx.font = `${Math.round(14 * scale)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(UNIT_EMOJI[unit.type] ?? "?", unit.x, drawY);

  ctx.restore();
}

// ── Enemy ───────────────────────────────────────────────────────────

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  config: ArenaConfig,
  sprites: ArenaSpriteManager,
): void {
  const perspective = config.perspective.slots[enemy.perspectiveSlot];
  const drawY = enemy.y + perspective.yOffset;
  const scale = perspective.scale;
  const size = BASE_UNIT_RADIUS * 2 * scale;

  ctx.save();

  if (enemy.state === "spawning") ctx.globalAlpha = 0.5;
  if (enemy.state === "dying") {
    ctx.globalAlpha = Math.max(0, enemy.animTimer / config.dyingDurationMs);
  }

  // For hit state, render as walking + red tint overlay
  const visualState = enemy.state === "hit" ? "walking" : enemy.state;
  const spriteState = enemySpriteState(visualState);
  let spriteTimer = globalTimer;
  if (enemy.state === "spawning") spriteTimer = config.spawningDurationMs - enemy.animTimer;
  else if (enemy.state === "dying") spriteTimer = config.dyingDurationMs - enemy.animTimer;

  if (
    sprites.hasSprite(enemy.spriteVariant) &&
    sprites.draw(ctx, enemy.spriteVariant, spriteState, spriteTimer, enemy.x, drawY, size, size, true)
  ) {
    if (enemy.state === "hit") {
      drawRedTint(ctx, enemy.x, drawY, size);
      // Arrow overlay
      if (enemy.hitByArrow) {
        const arrowElapsed = config.hitFlashMs - enemy.animTimer;
        if (!sprites.hasSprite("arrow-hit") ||
            !sprites.draw(ctx, "arrow-hit", "hit", arrowElapsed, enemy.x, drawY, size * 0.6, size * 0.6)) {
          ctx.font = `${Math.round(10 * scale)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🏹", enemy.x + size * 0.2, drawY - size * 0.15);
        }
      }
    }
    ctx.restore();
    return;
  }

  // Fallback: colored circle + emoji
  const radius = BASE_UNIT_RADIUS * scale;

  ctx.fillStyle = enemy.state === "spawning" ? COLORS.enemySpawning : COLORS.enemy;
  ctx.beginPath();
  ctx.arc(enemy.x, drawY, radius, 0, Math.PI * 2);
  ctx.fill();

  if (enemy.state === "hit") {
    drawRedTint(ctx, enemy.x, drawY, radius * 2);
    if (enemy.hitByArrow) {
      ctx.font = `${Math.round(10 * scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText("🏹", enemy.x + radius * 0.6, drawY - radius * 0.4);
    }
  }

  ctx.font = `${Math.round(14 * scale)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(ENEMY_EMOJI[enemy.spriteVariant] ?? "💀", enemy.x, drawY);

  ctx.restore();
}
