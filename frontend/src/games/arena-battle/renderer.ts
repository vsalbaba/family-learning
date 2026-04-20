import type { ArenaGameState } from "./game-state";
import type {
  ArenaConfig,
  Enemy,
  PerspectiveSlot,
  PlayerUnit,
  SpellEffect,
} from "./types";

// ── Colors ──────────────────────────────────────────────────────────

const COLORS = {
  background: "#d4e6b5", // light green field
  laneLine: "#b8d494",
  playerCastle: "#4a7ab5", // blue castle
  playerCastleRoof: "#3a6295",
  enemyCastle: "#b54a4a", // red castle
  enemyCastleRoof: "#953a3a",
  pesak: "#4a8ab5",
  lucistnik: "#5aaa5a",
  carodej: "#9a5ab5",
  obr: "#8a6a3a",
  enemy: "#c44a4a",
  enemySpawning: "rgba(196,74,74,0.5)",
  hitFlash: "rgba(255,0,0,0.5)",
  spellEffect: "rgba(255,220,60,0.6)",
  hpBarBg: "rgba(0,0,0,0.3)",
  hpBarFill: "#4caf50",
  hpBarLow: "#f44336",
};

const UNIT_EMOJI: Record<string, string> = {
  pesak: "🗡",
  lucistnik: "🏹",
  carodej: "🧙",
  obr: "👹",
  enemy: "💀",
};

const UNIT_COLOR: Record<string, string> = {
  pesak: COLORS.pesak,
  lucistnik: COLORS.lucistnik,
  carodej: COLORS.carodej,
  obr: COLORS.obr,
};

const BASE_UNIT_RADIUS = 14;

// ── Render order ────────────────────────────────────────────────────

const SLOT_ORDER: PerspectiveSlot[] = ["back", "mid", "front"];

// ── Main render ─────────────────────────────────────────────────────

export function render(
  ctx: CanvasRenderingContext2D,
  state: ArenaGameState,
  _dt: number, // eslint-disable-line @typescript-eslint/no-unused-vars -- reserved for animations
): void {
  const { config } = state;

  ctx.clearRect(0, 0, config.boardWidthPx, config.boardHeightPx);

  drawBackground(ctx, config);
  drawCastles(ctx, config);
  drawSpellEffects(ctx, state);
  drawEntitiesSorted(ctx, state);
}

// ── Background ──────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, config: ArenaConfig): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, config.boardWidthPx, config.boardHeightPx);

  // Lane horizontal lines (subtle)
  ctx.strokeStyle = COLORS.laneLine;
  ctx.lineWidth = 1;
  const top = config.laneCenterY - 40;
  const bottom = config.laneCenterY + 40;
  ctx.beginPath();
  ctx.moveTo(config.castleWidthPx, top);
  ctx.lineTo(config.boardWidthPx - config.castleWidthPx, top);
  ctx.moveTo(config.castleWidthPx, bottom);
  ctx.lineTo(config.boardWidthPx - config.castleWidthPx, bottom);
  ctx.stroke();
}

// ── Castles ─────────────────────────────────────────────────────────

function drawCastles(ctx: CanvasRenderingContext2D, config: ArenaConfig): void {
  const h = config.boardHeightPx;
  const cw = config.castleWidthPx;

  // Player castle (left)
  ctx.fillStyle = COLORS.playerCastle;
  ctx.fillRect(0, 0, cw, h);
  ctx.fillStyle = COLORS.playerCastleRoof;
  ctx.fillRect(0, 0, cw, 12);
  ctx.fillRect(0, h - 12, cw, 12);

  // Enemy castle (right)
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
): void {
  for (const effect of state.spellEffects) {
    drawSpellEffect(ctx, effect);
  }
}

function drawSpellEffect(
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
): void {
  const { config } = state;

  // Collect all entities with their perspective info
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
      draw: () => drawPlayerUnit(ctx, unit, config),
    });
  }

  for (const enemy of state.enemies.values()) {
    entries.push({
      slot: enemy.perspectiveSlot,
      x: enemy.x,
      draw: () => drawEnemy(ctx, enemy, config),
    });
  }

  // Sort: back first, then mid, then front. Within same slot, by x.
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
): void {
  const perspective = config.perspective.slots[unit.perspectiveSlot];
  const drawY = unit.y + perspective.yOffset;
  const scale = perspective.scale;
  const radius = BASE_UNIT_RADIUS * scale;

  ctx.save();

  // Dying: fade out
  if (unit.state === "dying") {
    const alpha = Math.max(0, unit.animTimer / config.dyingDurationMs);
    ctx.globalAlpha = alpha;
  }

  // Base circle
  ctx.fillStyle = UNIT_COLOR[unit.type] ?? COLORS.pesak;
  ctx.beginPath();
  ctx.arc(unit.x, drawY, radius, 0, Math.PI * 2);
  ctx.fill();

  // Hit flash overlay
  if (unit.state === "hit") {
    ctx.fillStyle = COLORS.hitFlash;
    ctx.beginPath();
    ctx.arc(unit.x, drawY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Emoji
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
): void {
  const perspective = config.perspective.slots[enemy.perspectiveSlot];
  const drawY = enemy.y + perspective.yOffset;
  const scale = perspective.scale;
  const radius = BASE_UNIT_RADIUS * scale;

  ctx.save();

  // Spawning: semi-transparent
  if (enemy.state === "spawning") {
    ctx.globalAlpha = 0.5;
  }

  // Dying: fade out
  if (enemy.state === "dying") {
    const alpha = Math.max(0, enemy.animTimer / config.dyingDurationMs);
    ctx.globalAlpha = alpha;
  }

  // Base circle
  ctx.fillStyle = enemy.state === "spawning" ? COLORS.enemySpawning : COLORS.enemy;
  ctx.beginPath();
  ctx.arc(enemy.x, drawY, radius, 0, Math.PI * 2);
  ctx.fill();

  // Hit flash overlay
  if (enemy.state === "hit") {
    ctx.fillStyle = COLORS.hitFlash;
    ctx.beginPath();
    ctx.arc(enemy.x, drawY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Arrow overlay for archer hits
    if (enemy.hitByArrow) {
      ctx.font = `${Math.round(10 * scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText("🏹", enemy.x + radius * 0.6, drawY - radius * 0.4);
    }
  }

  // Emoji
  ctx.font = `${Math.round(14 * scale)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(UNIT_EMOJI.enemy, enemy.x, drawY);

  ctx.restore();
}
