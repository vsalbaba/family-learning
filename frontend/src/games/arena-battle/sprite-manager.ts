import type { EnemyState, PlayerUnitState } from "./types";

// ── Sprite sheet layout definition ──────────────────────────────────

interface FrameRange {
  row: number;
  frames: number;
  frameDurationMs: number;
  loop: boolean;
}

interface SheetDef {
  frameW: number;
  frameH: number;
  cols: number;
  states: Record<string, FrameRange>;
}

// ── Sheet definitions ───────────────────────────────────────────────

/** Player units: 128×128 frames, 4 columns, 4 rows (walking/attacking/hit/dying) */
const PLAYER_SHEET: SheetDef = {
  frameW: 128,
  frameH: 128,
  cols: 4,
  states: {
    "walking":   { row: 0, frames: 4, frameDurationMs: 150, loop: true },
    "attacking": { row: 1, frames: 3, frameDurationMs: 200, loop: false },
    "hit":       { row: 2, frames: 2, frameDurationMs: 75,  loop: false },
    "dying":     { row: 3, frames: 4, frameDurationMs: 100, loop: false },
  },
};

/** Enemies: 128×128 frames, 4 columns, 5 rows (spawning/walking/attacking/hit/dying) */
const ENEMY_SHEET: SheetDef = {
  frameW: 128,
  frameH: 128,
  cols: 4,
  states: {
    "spawning":  { row: 0, frames: 3, frameDurationMs: 70,  loop: false },
    "walking":   { row: 1, frames: 4, frameDurationMs: 150, loop: true },
    "attacking": { row: 2, frames: 3, frameDurationMs: 200, loop: false },
    "hit":       { row: 3, frames: 2, frameDurationMs: 75,  loop: false },
    "dying":     { row: 4, frames: 4, frameDurationMs: 100, loop: false },
  },
};

/** Arrow hit effect: 64×64 frames, 2 columns, 1 row */
const ARROW_HIT_SHEET: SheetDef = {
  frameW: 64,
  frameH: 64,
  cols: 2,
  states: {
    "hit": { row: 0, frames: 2, frameDurationMs: 75, loop: false },
  },
};

/** Spell effect: 64×64 frames, 4 columns, 1 row */
const SPELL_SHEET: SheetDef = {
  frameW: 64,
  frameH: 64,
  cols: 4,
  states: {
    "cast": { row: 0, frames: 4, frameDurationMs: 100, loop: false },
  },
};

const SHEET_DEFS: Record<string, SheetDef> = {
  "pesak": PLAYER_SHEET,
  "lucistnik": PLAYER_SHEET,
  "carodej": PLAYER_SHEET,
  "obr": PLAYER_SHEET,
  "enemy-skeleton": ENEMY_SHEET,
  "enemy-orc": ENEMY_SHEET,
  "enemy-bat": ENEMY_SHEET,
  "arrow-hit": ARROW_HIT_SHEET,
  "spell": SPELL_SHEET,
};

// ── Available enemy variants ────────────────────────────────────────

export const ENEMY_VARIANTS = ["enemy-skeleton", "enemy-orc", "enemy-bat"] as const;
export type EnemyVariant = (typeof ENEMY_VARIANTS)[number];

export function randomEnemyVariant(): EnemyVariant {
  return ENEMY_VARIANTS[Math.floor(Math.random() * ENEMY_VARIANTS.length)];
}

// ── Sprite manager ──────────────────────────────────────────────────

export interface ArenaSpriteManager {
  loaded: boolean;
  load(sheets: Record<string, string>): Promise<void>;
  draw(
    ctx: CanvasRenderingContext2D,
    entity: string,
    state: string,
    timerMs: number,
    x: number,
    y: number,
    w: number,
    h: number,
    flipX?: boolean,
  ): boolean;
  hasSprite(entity: string): boolean;
}

export function createArenaSpriteManager(): ArenaSpriteManager {
  const images = new Map<string, HTMLImageElement>();

  return {
    loaded: false,

    async load(sheets: Record<string, string>) {
      const promises = Object.entries(sheets).map(([name, url]) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            images.set(name, img);
            resolve();
          };
          img.onerror = () => resolve(); // fallback to emoji
          img.src = url;
        });
      });
      await Promise.all(promises);
      this.loaded = true;
    },

    hasSprite(entity: string): boolean {
      return images.has(entity) && entity in SHEET_DEFS;
    },

    draw(
      ctx: CanvasRenderingContext2D,
      entity: string,
      state: string,
      timerMs: number,
      x: number,
      y: number,
      w: number,
      h: number,
      flipX?: boolean,
    ): boolean {
      const img = images.get(entity);
      const def = SHEET_DEFS[entity];
      if (!img || !def) return false;

      const frameDef = def.states[state] ?? def.states["walking"] ?? def.states["hit"];
      if (!frameDef) return false;

      let frameIndex: number;
      if (frameDef.loop) {
        const totalDuration = frameDef.frames * frameDef.frameDurationMs;
        const elapsed = ((timerMs % totalDuration) + totalDuration) % totalDuration;
        frameIndex = Math.floor(elapsed / frameDef.frameDurationMs);
      } else {
        frameIndex = Math.min(
          Math.floor(timerMs / frameDef.frameDurationMs),
          frameDef.frames - 1,
        );
      }

      const sx = frameIndex * def.frameW;
      const sy = frameDef.row * def.frameH;

      ctx.imageSmoothingEnabled = false;
      if (flipX) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, sx, sy, def.frameW, def.frameH, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(img, sx, sy, def.frameW, def.frameH, x - w / 2, y - h / 2, w, h);
      }
      ctx.imageSmoothingEnabled = true;

      return true;
    },
  };
}

/** Paths for all arena sprite sheets. */
export const ARENA_SPRITE_PATHS: Record<string, string> = {
  "pesak": "/games/arena-battle/sprites/pesak.png",
  "lucistnik": "/games/arena-battle/sprites/lucistnik.png",
  "carodej": "/games/arena-battle/sprites/carodej.png",
  "obr": "/games/arena-battle/sprites/obr.png",
  "enemy-skeleton": "/games/arena-battle/sprites/enemy-skeleton.png",
  "enemy-orc": "/games/arena-battle/sprites/enemy-orc.png",
  "enemy-bat": "/games/arena-battle/sprites/enemy-bat.png",
  "arrow-hit": "/games/arena-battle/sprites/arrow-hit.png",
  "spell": "/games/arena-battle/sprites/spell.png",
};

/** Map PlayerUnitState to sprite state key. */
export function playerSpriteState(state: PlayerUnitState): string {
  return state; // 1:1 mapping
}

/** Map EnemyState to sprite state key. */
export function enemySpriteState(state: EnemyState): string {
  return state; // 1:1 mapping
}
