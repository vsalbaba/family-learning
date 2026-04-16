import type { GameState } from "./game-state";
import type { Animal, GameConfig } from "./types";
import type { SpriteManager } from "./sprite-manager";
import { animalSpriteState, goblinSpriteState } from "./sprite-manager";

// ── Colors ──────────────────────────────────────────────────────────

const COLORS = {
  boardBg: "#8fbc6b",       // grass green
  laneLine: "#6b9c4b",      // darker green lane divider
  colLine: "rgba(0,0,0,0.08)",
  barnBg: "#c8a96e",        // barn wood
  barnBorder: "#8b6914",
  chicken: "#f5c842",       // yellow
  llama: "#e0e0e0",         // light gray
  ram: "#8b5e3c",           // brown
  goblin: "#6b8e23",        // olive green
  goblinSpawning: "rgba(107,142,35,0.5)",
  projectile: "#a0d911",    // lime spit
  eggReady: "#fff4cc",      // warm glow
  eggDot: "#ffaa00",        // egg indicator
  slotHighlight: "rgba(79,70,229,0.2)", // indigo tint
  slotBorder: "#4f46e5",
  hitFlash: "rgba(255,0,0,0.5)",
  facingArrow: "#333",
};

// ── Animation timer ─────────────────────────────────────────────────

let globalTimer = 0;

// ── Main render ─────────────────────────────────────────────────────

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteManager,
  dt: number,
): void {
  globalTimer += dt;

  const { config } = state;
  const totalWidth = config.barnWidthPx + config.boardWidthPx;
  const totalHeight = config.boardHeightPx;

  ctx.clearRect(0, 0, totalWidth, totalHeight);

  drawBarnArea(ctx, state, sprites);

  // Shift drawing origin to playable board
  ctx.save();
  ctx.translate(config.barnWidthPx, 0);

  drawBoard(ctx, config);
  drawSlotHighlights(ctx, state);
  drawAnimals(ctx, state, sprites);
  drawGoblins(ctx, state, sprites);
  drawProjectiles(ctx, state, sprites);

  ctx.restore();
}

// ── Barn area ───────────────────────────────────────────────────────

function drawBarnArea(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteManager,
): void {
  const { config } = state;
  const w = config.barnWidthPx;
  const h = config.boardHeightPx;

  // Background
  ctx.fillStyle = COLORS.barnBg;
  ctx.fillRect(0, 0, w, h);

  // Border
  ctx.strokeStyle = COLORS.barnBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, w, h);

  // Barn chicken
  const cx = w / 2;
  const cy = h / 2;
  const drawSize = Math.min(w, h) * 0.5;
  const barnState = state.barnChicken.eggReady ? "egg-ready" : "idle";

  if (sprites.hasSprite("chicken")) {
    sprites.draw(ctx, "chicken", barnState, globalTimer, cx, cy, drawSize, drawSize);
  } else {
    // Fallback: circle + emoji
    const radius = Math.min(w, h) * 0.2;
    if (state.barnChicken.eggReady) {
      ctx.fillStyle = COLORS.eggReady;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COLORS.chicken;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b8941e";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (state.barnChicken.eggReady) {
      ctx.fillStyle = COLORS.eggDot;
      ctx.beginPath();
      ctx.arc(cx, cy + radius * 0.5, radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#5a3e1a";
    ctx.font = `bold ${Math.round(w * 0.15)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("🐔", cx, cy + radius + 20);
  }
}

// ── Board ───────────────────────────────────────────────────────────

function drawBoard(ctx: CanvasRenderingContext2D, config: GameConfig): void {
  const { boardWidthPx: w, boardHeightPx: h, laneCount, colCount } = config;
  const laneH = h / laneCount;
  const colW = w / colCount;

  // Board background
  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(0, 0, w, h);

  // Lane dividers
  ctx.strokeStyle = COLORS.laneLine;
  ctx.lineWidth = 2;
  for (let i = 1; i < laneCount; i++) {
    const y = i * laneH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Column dividers
  ctx.strokeStyle = COLORS.colLine;
  ctx.lineWidth = 1;
  for (let i = 1; i < colCount; i++) {
    const x = i * colW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Board border
  ctx.strokeStyle = "#4a7c2e";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, w, h);
}

// ── Slot highlights (placement mode) ────────────────────────────────

function drawSlotHighlights(
  ctx: CanvasRenderingContext2D,
  state: GameState,
): void {
  if (state.toolMode.kind !== "place") return;
  if (state.eggs < state.config.unitCosts[state.toolMode.unitType]) return;

  const { config } = state;
  const colW = config.boardWidthPx / config.colCount;
  const laneH = config.boardHeightPx / config.laneCount;

  for (let lane = 0; lane < config.laneCount; lane++) {
    for (let col = 0; col < config.colCount; col++) {
      if (state.grid[lane][col] !== null) continue;

      const x = col * colW;
      const y = lane * laneH;

      ctx.fillStyle = COLORS.slotHighlight;
      ctx.fillRect(x + 2, y + 2, colW - 4, laneH - 4);

      ctx.strokeStyle = COLORS.slotBorder;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x + 2, y + 2, colW - 4, laneH - 4);
      ctx.setLineDash([]);
    }
  }
}

// ── Animals ─────────────────────────────────────────────────────────

function drawAnimals(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteManager,
): void {
  for (const animal of state.animals.values()) {
    drawAnimal(ctx, animal, state, sprites);
  }
}

function drawAnimal(
  ctx: CanvasRenderingContext2D,
  animal: Animal,
  state: GameState,
  sprites: SpriteManager,
): void {
  const cellSize = Math.min(
    state.config.boardWidthPx / state.config.colCount,
    state.config.boardHeightPx / state.config.laneCount,
  );
  const drawSize = cellSize * 0.7;
  const { x, y } = animal;

  // Dying: shrink
  let scale = 1;
  let alpha = 1;
  if (animal.state === "dying") {
    const progress = 1 - animal.animTimer / state.config.dyingDurationMs;
    scale = 1 - progress;
    alpha = 1 - progress;
    if (scale < 0.05) return;
  }

  const w = drawSize * scale;
  const h = drawSize * scale;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Try sprite first
  // For non-looping states (hit, dying), use elapsed time since state started.
  // animTimer counts DOWN from the max duration, so elapsed = max - remaining.
  const spriteState = animalSpriteState(animal.state);
  let spriteTimer = globalTimer;
  if (animal.state === "hit") {
    spriteTimer = state.config.hitFlashMs - animal.animTimer;
  } else if (animal.state === "dying") {
    spriteTimer = state.config.dyingDurationMs - animal.animTimer;
  }
  // Llama sprites face right by default — flip when facing left
  const flipX = animal.type === "llama" && animal.facing === "left";
  if (sprites.hasSprite(animal.type) && sprites.draw(ctx, animal.type, spriteState, spriteTimer, x, y, w, h, flipX)) {
    ctx.restore();
    return;
  }

  // ── Fallback: circle + emoji ────────────────────────────────────
  const radius = w / 2;

  // Hit flash
  if (animal.state === "hit") {
    ctx.fillStyle = COLORS.hitFlash;
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Egg-ready glow (chicken)
  if (animal.type === "chicken" && animal.eggReady) {
    ctx.fillStyle = COLORS.eggReady;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body color
  const colors: Record<string, string> = {
    chicken: COLORS.chicken,
    llama: COLORS.llama,
    ram: COLORS.ram,
  };
  ctx.fillStyle = colors[animal.type] ?? "#999";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Egg dot (chicken)
  if (animal.type === "chicken" && animal.eggReady) {
    ctx.fillStyle = COLORS.eggDot;
    ctx.beginPath();
    ctx.arc(x, y + radius * 0.4, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Facing arrow (llama)
  if (animal.type === "llama") {
    drawFacingArrow(ctx, animal, radius);
  }

  // Ram horns indicator
  if (animal.type === "ram") {
    ctx.fillStyle = "#5a3a1a";
    ctx.beginPath();
    ctx.arc(x + radius * 0.6, y - radius * 0.4, radius * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + radius * 0.6, y + radius * 0.4, radius * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Label emoji
  const emojis: Record<string, string> = {
    chicken: "🐔",
    llama: "🦙",
    ram: "🐏",
  };
  ctx.font = `${Math.round(radius * 0.9)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emojis[animal.type] ?? "?", x, y);

  ctx.restore();
}

function drawFacingArrow(
  ctx: CanvasRenderingContext2D,
  animal: Animal,
  radius: number,
): void {
  const arrowDir = animal.facing === "right" ? 1 : -1;
  const ax = animal.x + arrowDir * (radius + 6);
  ctx.fillStyle = COLORS.facingArrow;
  ctx.beginPath();
  ctx.moveTo(ax, animal.y);
  ctx.lineTo(ax - arrowDir * 8, animal.y - 5);
  ctx.lineTo(ax - arrowDir * 8, animal.y + 5);
  ctx.closePath();
  ctx.fill();
}

// ── Goblins ─────────────────────────────────────────────────────────

function drawGoblins(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteManager,
): void {
  for (const goblin of state.goblins.values()) {
    drawGoblin(ctx, goblin, state, sprites);
  }
}

function drawGoblin(
  ctx: CanvasRenderingContext2D,
  goblin: import("./types").Goblin,
  state: GameState,
  sprites: SpriteManager,
): void {
  const cellSize = Math.min(
    state.config.boardWidthPx / state.config.colCount,
    state.config.boardHeightPx / state.config.laneCount,
  );
  const drawSize = cellSize * 0.6;
  const { x, y } = goblin;

  let scale = 1;
  let alpha = 1;

  if (goblin.state === "spawning") {
    const progress = 1 - goblin.animTimer / state.config.spawningDurationMs;
    scale = progress;
    alpha = progress;
  } else if (goblin.state === "dying") {
    const progress = 1 - goblin.animTimer / state.config.dyingDurationMs;
    scale = 1 - progress;
    alpha = 1 - progress;
  }

  if (scale < 0.05) return;

  const w = drawSize * scale;
  const h = drawSize * scale;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Sprite timer: use elapsed time for non-looping states
  const spriteKey = `goblin-${goblin.goblinType}`;
  const spriteState = goblinSpriteState(goblin.state);
  let spriteTimer = globalTimer;
  if (goblin.state === "spawning") {
    spriteTimer = state.config.spawningDurationMs - goblin.animTimer;
  } else if (goblin.state === "dying") {
    spriteTimer = state.config.dyingDurationMs - goblin.animTimer;
  }

  if (sprites.hasSprite(spriteKey) && sprites.draw(ctx, spriteKey, spriteState, spriteTimer, x, y, w, h)) {
    ctx.restore();
    return;
  }

  // Fallback: circle + emoji
  const radius = w / 2;
  ctx.fillStyle = goblin.state === "spawning" ? COLORS.goblinSpawning : COLORS.goblin;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `${Math.round(radius * 0.9)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("👹", x, y);

  ctx.restore();
}

// ── Projectiles ─────────────────────────────────────────────────────

function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteManager,
): void {
  for (const proj of state.projectiles.values()) {
    const size = 24;
    const flipX = proj.dx < 0;
    const timer = proj.state === "hit" ? proj.animTimer : globalTimer;

    if (sprites.hasSprite("spit") && sprites.draw(ctx, "spit", proj.state, timer, proj.x, proj.y, size, size, flipX)) {
      continue;
    }

    // Fallback: colored circle
    ctx.fillStyle = COLORS.projectile;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}
