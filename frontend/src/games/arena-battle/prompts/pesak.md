# Prompt pro generování sprite sheetu — Pěšák

## Prompt

Create a pixel art sprite sheet for a swordsman character. The sheet is a single PNG image, 512×512 pixels, arranged as a 4×4 grid of 128×128 pixel cells.

**Style:** Anime-inspired pixel art. Simple, bold silhouette, readable at very small sizes (28–32 px). The character wears blue-silver armor and carries a short sword. No fine details that disappear at small scale — use strong outlines and high-contrast shapes. The character should look like a brave young knight, not grim or realistic.

**Background:** Solid magenta (RGB 255, 0, 255) filling every pixel that is not part of the character. No transparency, no anti-aliasing against the background — hard pixel edges only. The magenta will be removed programmatically.

**Orientation:** The character faces **right** in all frames.

**Grid layout (4 columns × 4 rows):**

**Row 0 — Walking (4 frames):**
Smooth walk cycle facing right. Sword held at the side. Alternating leg positions. Frame 1: left foot forward. Frame 2: neutral. Frame 3: right foot forward. Frame 4: neutral (mirrored from frame 2). The character should appear to march steadily.

**Row 1 — Attacking (3 frames):**
Sword swing animation. Frame 1: wind-up, sword pulled back. Frame 2: mid-swing, sword extended forward at chest height. Frame 3: follow-through, sword low after the slash. Clear arc of motion.

**Row 2 — Hit / Taking damage (2 frames):**
Frame 1: character recoils backward, slight lean to the left, eyes squinted. Frame 2: brief red flash overlay or red tint on the character body to indicate pain. Keep the remaining 2 cells in this row empty (solid magenta).

**Row 3 — Dying (4 frames):**
Frame 1: character stumbles, knees buckling. Frame 2: falling to the side. Frame 3: on the ground. Frame 4: faded/ghostly version of the fallen character (semi-transparent look achieved via lighter colors, not actual alpha).

**Important constraints:**
- Exactly 512×512 px total image
- Exactly 128×128 px per cell, no gaps, no borders between cells
- Pure magenta (255, 0, 255) background in every non-character pixel
- No anti-aliasing against the magenta — character edges must be pixel-sharp
- The character should be roughly 80–100 px tall within each 128×128 cell, centered
- Consistent proportions and position across all frames (character doesn't jump between cells)
- Color palette: blue armor, silver sword/highlights, dark blue outlines, skin tone for face/hands
- Pixel art style — visible individual pixels, not smooth/painted
