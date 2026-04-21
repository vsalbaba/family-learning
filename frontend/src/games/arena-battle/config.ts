import type { ArenaConfig } from "./types";

/**
 * Arena Battle — default game configuration.
 *
 * ## Board
 * Single lane, 800×200 px. Player castle (blue) on the left, enemy castle (red)
 * on the right, each 60 px wide. Playable area between castles = 680 px.
 *
 * ## Game flow
 * - Duration: 75 s countdown.
 * - Win: timer expires and no enemy has reached the player castle.
 * - Loss: any enemy reaches the player castle (x ≤ castleWidthPx).
 * - Child answers math questions (easy or hard) → correct answer spawns a unit.
 *
 * ## Units (spawned by correct answers)
 *
 * | Unit       | Tier | HP  | Dmg | Speed | Range  | CD    | Notes              |
 * |------------|------|-----|-----|-------|--------|-------|--------------------|
 * | Pěšák      | easy |  60 |  15 |  40   |  20 px | 1.2 s | melee              |
 * | Lučištník  | easy |  40 |  12 |  35   | 150 px | 1.4 s | ranged, arrow hit  |
 * | Čaroděj    | hard |  60 |  20 |  30   | 150 px | 2.2 s | ranged, splash 35  |
 * | Obr        | hard | 150 |  20 |  25   |  25 px | 1.8 s | melee tank         |
 *
 * Easy answer → random(pěšák, lučištník). Hard answer → random(čaroděj, obr).
 * All attacks are instant hit — no projectiles.
 *
 * ## Enemies
 * Single type: 100 HP, 12 dmg, 40 px/s, 15 px range, 1 s cooldown.
 * Spawn in bursts of 2–4 with 400 ms between them, then a longer pause.
 *
 * ## Spawn phases (inter-burst pause decreases over time)
 * - 0–25 s:  5.0 s between bursts → ~6 bursts → ~15 enemies
 * - 25–50 s: 4.0 s between bursts → ~6 bursts → ~18 enemies
 * - 50–75 s: 3.0 s between bursts → ~8 bursts → ~24 enemies
 *
 * ## Balance targets
 * - ~12–15 correct answers with a mix of easy+hard → comfortable win
 * - Pure easy at 80% accuracy → narrow win/loss (motivates hard picks)
 * - 1–2 answers alone → not enough to win
 *
 * ## Perspective (visual only, no gameplay effect)
 * Three discrete slots (back/mid/front) assigned round-robin at spawn.
 * Affects y-offset and scale for pseudo-3D depth. Render order: back → front.
 *
 * ## Question generation
 * - Easy pool: small multiplication (a,b ∈ [1..10]) + addition without carry
 * - Hard pool: large multiplication (≥1 factor in [11..20]) + addition with carry
 * - Subtype weights configurable (default: 60/40 easy, 50/50 hard)
 * - Anti-repeat: last 3 question keys per pool, max 2 same subtype in a row
 * - Factor-1 questions (e.g. 1×7) have reduced probability (20%)
 */
export const DEFAULT_CONFIG: ArenaConfig = {
  // ── Board layout ────────────────────────────────────────────────
  boardWidthPx: 800,
  boardHeightPx: 200,
  castleWidthPx: 60,
  laneCenterY: 100,

  // ── Game duration ───────────────────────────────────────────────
  gameDurationMs: 75_000,

  // ── Player unit stats ───────────────────────────────────────────
  unitStats: {
    pesak: {
      hp: 70,
      damage: 15,
      speed: 45,
      attackRange: 20,
      attackCooldownMs: 1200,
      splashRadius: 0,
    },
    lucistnik: {
      hp: 40,
      damage: 12,
      speed: 35,
      attackRange: 150,
      attackCooldownMs: 1400,
      splashRadius: 0,
    },
    carodej: {
      hp: 60,
      damage: 20,
      speed: 30,
      attackRange: 150,
      attackCooldownMs: 2200,
      splashRadius: 35,
    },
    obr: {
      hp: 150,
      damage: 20,
      speed: 15,
      attackRange: 25,
      attackCooldownMs: 1800,
      splashRadius: 5,
    },
  },

  // ── Enemy stats ─────────────────────────────────────────────────
  enemyStats: {
    hp: 55,
    damage: 7,
    speed: 28,
    attackRange: 15,
    attackCooldownMs: 1200,
  },

  // ── Spawn phases (inter-burst pause decreases over time) ────────
  spawnPhases: [
    { afterMs: 0, intervalMs: 5000 },
    { afterMs: 25_000, intervalMs: 4000 },
    { afterMs: 50_000, intervalMs: 3000 },
  ],

  // ── Burst spawning (enemies arrive in groups) ───────────────────
  burst: {
    minSize: 2,  // minimum enemies per burst
    maxSize: 4,  // maximum enemies per burst
    delayMs: 400, // ms between enemies within a burst
  },

  // ── Animation timings ───────────────────────────────────────────
  spawningDurationMs: 200,
  dyingDurationMs: 300,
  hitFlashMs: 150,
  spellDurationMs: 400,

  // ── Pseudo-perspective (visual only) ────────────────────────────
  perspective: {
    slots: {
      back: { yOffset: -20, scale: 0.85 },
      mid: { yOffset: 0, scale: 1.0 },
      front: { yOffset: 20, scale: 1.15 },
    },
  },

  // ── Question generation ─────────────────────────────────────────
  question: {
    easySubtypeWeights: { small_mul: 50, add_no_carry: 30, small_div: 20 },
    hardSubtypeWeights: { large_mul: 40, add_carry: 35, large_div: 25 },
    recentHistorySize: 3,       // no repeated question key within last N
    maxSameSubtypeStreak: 2,    // force subtype switch after N in a row
    factor1Weight: 0.2,         // reduced probability for trivial 1×n
  },
};
