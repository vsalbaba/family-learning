import type { AnimalState, GoblinState } from "./types";

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

/**
 * Sprite sheet definitions.
 * Each key maps an entity name to its sheet layout:
 * - frameW/frameH: pixel size of each frame in the source image
 * - cols: number of columns in the sheet
 * - states: mapping from state name to row index, frame count, timing
 */
const SHEET_DEFS: Record<string, SheetDef> = {
  chicken: {
    frameW: 128,
    frameH: 128,
    cols: 4,
    states: {
      "idle":      { row: 0, frames: 2, frameDurationMs: 250, loop: true },
      "egg-ready": { row: 1, frames: 3, frameDurationMs: 200, loop: true },
      "hit":       { row: 2, frames: 2, frameDurationMs: 75,  loop: false },
      "dying":     { row: 3, frames: 4, frameDurationMs: 100, loop: false },
    },
  },
  llama: {
    frameW: 128,
    frameH: 128,
    cols: 4,
    states: {
      "idle":      { row: 0, frames: 3, frameDurationMs: 250, loop: true },
      "attacking": { row: 1, frames: 3, frameDurationMs: 100, loop: false },
      "cooldown":  { row: 2, frames: 3, frameDurationMs: 250, loop: true },
      "hit":       { row: 3, frames: 2, frameDurationMs: 75,  loop: false },
      "dying":     { row: 4, frames: 4, frameDurationMs: 100, loop: false },
    },
  },
  spit: {
    frameW: 64,
    frameH: 64,
    cols: 4,
    states: {
      "flying": { row: 0, frames: 4, frameDurationMs: 80,  loop: true },
      "hit":    { row: 1, frames: 3, frameDurationMs: 60,  loop: false },
    },
  },
  ram: {
    frameW: 128,
    frameH: 128,
    cols: 4,
    states: {
      "idle":      { row: 0, frames: 2, frameDurationMs: 250, loop: true },
      "attacking": { row: 1, frames: 3, frameDurationMs: 100, loop: false },
      "cooldown":  { row: 2, frames: 3, frameDurationMs: 250, loop: true },
      "hit":       { row: 3, frames: 2, frameDurationMs: 75,  loop: false },
      "dying":     { row: 4, frames: 4, frameDurationMs: 100, loop: false },
    },
  },
  "goblin-basic": {
    frameW: 128,
    frameH: 128,
    cols: 5,
    states: {
      "spawning":  { row: 0, frames: 5, frameDurationMs: 40,  loop: false },
      "walking":   { row: 1, frames: 4, frameDurationMs: 150, loop: true },
      "attacking": { row: 2, frames: 3, frameDurationMs: 100, loop: false },
      "idle":      { row: 3, frames: 3, frameDurationMs: 250, loop: true },
      "knockback": { row: 4, frames: 4, frameDurationMs: 100, loop: false },
      "hit":       { row: 5, frames: 3, frameDurationMs: 75,  loop: false },
      "dying":     { row: 6, frames: 4, frameDurationMs: 100, loop: false },
    },
  },
};

// ── Sprite manager ──────────────────────────────────────────────────

export interface SpriteManager {
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

export function createSpriteManager(): SpriteManager {
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
          img.onerror = () => {
            // Silently skip failed loads — renderer will fall back
            resolve();
          };
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

      const frameDef = def.states[state] ?? def.states["idle"];
      if (!frameDef) return false;

      // Pick frame based on timer
      let frameIndex: number;
      if (frameDef.loop) {
        const totalDuration = frameDef.frames * frameDef.frameDurationMs;
        const elapsed = ((timerMs % totalDuration) + totalDuration) % totalDuration;
        frameIndex = Math.floor(elapsed / frameDef.frameDurationMs);
      } else {
        // Non-looping: clamp to last frame
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

/** Paths for all available sprite sheets. */
export const SPRITE_PATHS: Record<string, string> = {
  chicken: "/games/farmageddon/sprites/chicken.png",
  llama: "/games/farmageddon/sprites/llama.png",
  ram: "/games/farmageddon/sprites/ram.png",
  spit: "/games/farmageddon/sprites/spit.png",
  "goblin-basic": "/games/farmageddon/sprites/goblin-basic.png",
};

/** Map AnimalState to the sprite state key. */
export function animalSpriteState(state: AnimalState): string {
  return state; // 1:1 mapping — state names match sheet def keys
}

/** Map GoblinState to the sprite state key. */
export function goblinSpriteState(state: GoblinState): string {
  return state;
}
