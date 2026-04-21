# Prompt — Arrow Hit (zabodnutý šíp)

## Prompt

Create a pixel art sprite sheet for an arrow hit effect. The sheet is a single PNG image, 128×64 pixels, arranged as a 1×2 grid of 64×64 pixel cells (one row, two columns).

**Style:** Anime-inspired pixel art. A single arrow embedded/stuck in the target, shown from the side. The arrow points to the left (as if it flew from left to right and hit something). Simple, clear silhouette recognizable at small sizes (~20 px on screen).

**Background:** Solid magenta (RGB 255, 0, 255). No transparency, no anti-aliasing against the background — hard pixel edges only.

**Animation sequence (2 frames, left to right):**

**Frame 1 — Impact:** Arrow just hit — embedded at a slight angle (pointing left, tilted ~15° down). Small impact lines/sparks radiating from the point of impact. The arrow shaft is brown/wooden, the arrowhead is silver/steel, fletching (feathers) at the back are light green or white.

**Frame 2 — Settled:** Same arrow, impact sparks gone. Arrow is stationary, slightly vibrating (show this by a very subtle position shift of 1-2 pixels compared to frame 1). Clean view of the embedded arrow.

**Important constraints:**
- Exactly 128×64 px total image (2 frames × 64×64)
- Pure magenta (255, 0, 255) background
- No anti-aliasing against magenta
- Arrow centered in each 64×64 cell
- Arrow length ~40-45 px, pointing left
- Color palette: brown shaft, silver/grey arrowhead, green/white fletching, yellow impact sparks in frame 1
- Pixel art style — visible individual pixels
