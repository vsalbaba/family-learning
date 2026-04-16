import type { GameState } from "./game-state";
import type { GameConfig } from "./types";

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

// ── Main render ─────────────────────────────────────────────────────

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
): void {
  const { config } = state;
  const totalWidth = config.barnWidthPx + config.boardWidthPx;
  const totalHeight = config.boardHeightPx;

  ctx.clearRect(0, 0, totalWidth, totalHeight);

  drawBarnArea(ctx, state);

  // Shift drawing origin to playable board
  ctx.save();
  ctx.translate(config.barnWidthPx, 0);

  drawBoard(ctx, config);
  drawSlotHighlights(ctx, state);
  drawAnimals(ctx, state);
  drawGoblins(ctx, state);
  drawProjectiles(ctx, state);

  ctx.restore();
}

// ── Barn area ───────────────────────────────────────────────────────

function drawBarnArea(ctx: CanvasRenderingContext2D, state: GameState): void {
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
  const radius = Math.min(w, h) * 0.2;

  // Egg-ready glow
  if (state.barnChicken.eggReady) {
    ctx.fillStyle = COLORS.eggReady;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Chicken body
  ctx.fillStyle = COLORS.chicken;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b8941e";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Egg dot
  if (state.barnChicken.eggReady) {
    ctx.fillStyle = COLORS.eggDot;
    ctx.beginPath();
    ctx.arc(cx, cy + radius * 0.5, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Label
  ctx.fillStyle = "#5a3e1a";
  ctx.font = `bold ${Math.round(w * 0.15)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("🐔", cx, cy + radius + 20);
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

function drawAnimals(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const animal of state.animals.values()) {
    drawAnimal(ctx, animal, state);
  }
}

function drawAnimal(
  ctx: CanvasRenderingContext2D,
  animal: import("./types").Animal,
  state: GameState,
): void {
  const size = Math.min(
    state.config.boardWidthPx / state.config.colCount,
    state.config.boardHeightPx / state.config.laneCount,
  ) * 0.35;

  const { x, y } = animal;

  // Hit flash
  if (animal.state === "hit") {
    ctx.fillStyle = COLORS.hitFlash;
    ctx.beginPath();
    ctx.arc(x, y, size + 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Egg-ready glow (chicken)
  if (animal.type === "chicken" && animal.eggReady) {
    ctx.fillStyle = COLORS.eggReady;
    ctx.beginPath();
    ctx.arc(x, y, size + 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dying: shrink
  let drawSize = size;
  if (animal.state === "dying") {
    const progress = 1 - animal.animTimer / state.config.dyingDurationMs;
    drawSize = size * (1 - progress);
    if (drawSize < 1) return;
  }

  // Body color
  const colors: Record<string, string> = {
    chicken: COLORS.chicken,
    llama: COLORS.llama,
    ram: COLORS.ram,
  };
  ctx.fillStyle = colors[animal.type] ?? "#999";
  ctx.beginPath();
  ctx.arc(x, y, drawSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Egg dot (chicken)
  if (animal.type === "chicken" && animal.eggReady) {
    ctx.fillStyle = COLORS.eggDot;
    ctx.beginPath();
    ctx.arc(x, y + drawSize * 0.4, drawSize * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Facing arrow (llama)
  if (animal.type === "llama") {
    const arrowDir = animal.facing === "right" ? 1 : -1;
    const ax = x + arrowDir * (drawSize + 6);
    ctx.fillStyle = COLORS.facingArrow;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.lineTo(ax - arrowDir * 8, y - 5);
    ctx.lineTo(ax - arrowDir * 8, y + 5);
    ctx.closePath();
    ctx.fill();
  }

  // Ram horns indicator
  if (animal.type === "ram") {
    ctx.fillStyle = "#5a3a1a";
    ctx.beginPath();
    ctx.arc(x + drawSize * 0.6, y - drawSize * 0.4, drawSize * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + drawSize * 0.6, y + drawSize * 0.4, drawSize * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Label emoji
  const emojis: Record<string, string> = {
    chicken: "🐔",
    llama: "🦙",
    ram: "🐏",
  };
  ctx.font = `${Math.round(drawSize * 0.9)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emojis[animal.type] ?? "?", x, y);
}

// ── Goblins ─────────────────────────────────────────────────────────

function drawGoblins(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const goblin of state.goblins.values()) {
    drawGoblin(ctx, goblin, state);
  }
}

function drawGoblin(
  ctx: CanvasRenderingContext2D,
  goblin: import("./types").Goblin,
  state: GameState,
): void {
  const size = Math.min(
    state.config.boardWidthPx / state.config.colCount,
    state.config.boardHeightPx / state.config.laneCount,
  ) * 0.3;

  const { x, y } = goblin;

  let drawSize = size;
  let alpha = 1;

  if (goblin.state === "spawning") {
    const progress = 1 - goblin.animTimer / state.config.spawningDurationMs;
    drawSize = size * progress;
    alpha = progress;
  } else if (goblin.state === "dying") {
    const progress = 1 - goblin.animTimer / state.config.dyingDurationMs;
    drawSize = size * (1 - progress);
    alpha = 1 - progress;
  }

  if (drawSize < 1) return;

  ctx.globalAlpha = alpha;

  // Body
  ctx.fillStyle = goblin.state === "spawning" ? COLORS.goblinSpawning : COLORS.goblin;
  ctx.beginPath();
  ctx.arc(x, y, drawSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Emoji
  ctx.font = `${Math.round(drawSize * 0.9)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("👹", x, y);

  ctx.globalAlpha = 1;
}

// ── Projectiles ─────────────────────────────────────────────────────

function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
): void {
  for (const proj of state.projectiles.values()) {
    ctx.fillStyle = COLORS.projectile;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}
