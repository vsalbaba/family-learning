/**
 * Sprite sheet manager — placeholder for future sprite-based rendering.
 *
 * Currently the renderer uses colored circles + emoji. When sprite sheets
 * are provided, this module will handle loading images, selecting animation
 * frames by state and timer, and drawing source rectangles to canvas.
 *
 * Usage (future):
 *   const sprites = createSpriteManager();
 *   await sprites.load({ chicken: "/sprites/chicken.png", ... });
 *   sprites.draw(ctx, "chicken", "idle", frameTimer, x, y, w, h);
 */

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
  ): void;
}

export function createSpriteManager(): SpriteManager {
  return {
    loaded: false,

    async load() {
      // TODO: load Image objects, parse sprite sheet metadata
      this.loaded = false;
    },

    draw() {
      // No-op until sprite sheets are provided.
      // The renderer falls back to its own colored shapes + emoji.
    },
  };
}
