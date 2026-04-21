# Prompt — Spell Effect (modrý sloup many)

## Prompt

Create a pixel art sprite sheet for a magic spell effect. The sheet is a single PNG image, 256×64 pixels, arranged as a 1×4 grid of 64×64 pixel cells (one row, four columns).

**Style:** Anime-inspired pixel art. A vertical column/pillar of blue magical energy erupting from the ground upward. The effect should look like a burst of arcane power — glowing blue core with lighter cyan/white highlights at the center, darker blue edges. Small sparkle particles around the column.

**Background:** Solid magenta (RGB 255, 0, 255). No transparency, no anti-aliasing against the background — hard pixel edges only.

**Animation sequence (4 frames, left to right):**

**Frame 1 — Emergence:** Small blue glow appears at ground level. A thin line of energy starts rising. Just the beginning of the effect — mostly empty space with a small bright spot at the bottom.

**Frame 2 — Rising:** The column is half-height, growing upward. Blue energy pillar clearly visible, ~20 px wide, ~40 px tall. Bright white-cyan core, blue outer glow.

**Frame 3 — Full blast:** Column at maximum intensity and height, filling most of the 64×64 frame vertically. Brightest frame — white/cyan center, blue edges, energy particles flying outward. This is the peak damage moment.

**Frame 4 — Dissipation:** Column fading out. Lighter, more transparent-looking (achieved via lighter colors, not alpha). Particles scattering. Energy breaking apart into wisps.

**Important constraints:**
- Exactly 256×64 px total image (4 frames × 64×64)
- Pure magenta (255, 0, 255) background
- No anti-aliasing against magenta
- The column should be centered horizontally in each 64×64 cell
- Ground level at the bottom ~8 px of each cell
- Color palette: deep blue (#1a3a8a), bright blue (#4488ff), cyan (#66ddff), white core (#eeffff)
- Pixel art style — visible individual pixels
