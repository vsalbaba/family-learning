/**
 * # Question Generator for Arena Battle
 *
 * Generates pairs of math questions (1 easy + 1 hard) displayed simultaneously
 * during the arena game. The child chooses which one to answer — easy spawns a
 * weaker unit, hard spawns a stronger one.
 *
 * ## Four question subtypes
 *
 * | Subtype        | Tier | Description                                       | Example    |
 * |----------------|------|---------------------------------------------------|------------|
 * | `small_mul`    | easy | a × b, both in [1..10]                            | 3 × 7 =   |
 * | `add_no_carry` | easy | a + b where unit digits don't overflow (no carry)  | 43 + 5 =  |
 * | `small_div`    | easy | p : a = ?, where a,b ∈ [2..5], p = a × b          | 12 : 3 =  |
 * | `large_mul`    | hard | a × b, at least one factor in [11..20]             | 14 × 8 =  |
 * | `add_carry`    | hard | a + b where unit digits overflow ≥ 10 (carry)     | 47 + 6 =  |
 * | `large_div`    | hard | p : a = ?, where a ∈ [2..10], b ∈ [5..10], p=a×b  | 56 : 8 =  |
 *
 * ## Anti-repetition
 *
 * - Each tier maintains a separate history of recent question keys (e.g. "mul:3:7").
 *   New questions are rejected if their key appears in the history (up to 20 retries).
 * - An anti-streak rule forces subtype alternation when the last N questions within
 *   a tier all used the same subtype.
 *
 * ## Distractors (wrong answers)
 *
 * Each question has exactly one wrong answer, designed to mimic common mistakes:
 * - **Multiplication:** adjacent multiple of one factor (e.g. 6×7=42 → 48 = 6×8).
 * - **Addition:** correct ± 1 or ± 10 (unit-digit or tens-digit error).
 */
import type { MathQuestion, QuestionConfig, QuestionSubtype, TaskPair, Tier } from "./types";

// ── Public API ──────────────────────────────────────────────────────

/** Circular buffer of recent question keys and subtypes for one tier. */
export interface QuestionHistory {
  keys: string[]; // last N question keys (oldest first)
  subtypes: QuestionSubtype[]; // last N subtypes (oldest first)
}

export function createEmptyHistory(): QuestionHistory {
  return { keys: [], subtypes: [] };
}

/**
 * Generate one easy + one hard question pair.
 * Each question is generated independently using its tier's history.
 */
export function generateTaskPair(
  easyHistory: QuestionHistory,
  hardHistory: QuestionHistory,
  config: QuestionConfig,
): TaskPair {
  return {
    easy: generateQuestion("easy", easyHistory, config),
    hard: generateQuestion("hard", hardHistory, config),
  };
}

/**
 * Record a question into history, dropping the oldest entry when maxSize
 * is exceeded. Call this after the child answers (or the pair is dismissed).
 */
export function pushHistory(
  history: QuestionHistory,
  question: MathQuestion,
  maxSize: number,
): void {
  history.keys.push(question.key);
  history.subtypes.push(question.subtype);
  if (history.keys.length > maxSize) {
    history.keys.shift();
    history.subtypes.shift();
  }
}

// ── Question generation ─────────────────────────────────────────────

/**
 * Generate a single question for the given tier.
 * Picks a subtype (respecting weights and anti-streak), then tries up to 20
 * times to produce a question whose key is not in the recent history.
 */
function generateQuestion(
  tier: Tier,
  history: QuestionHistory,
  config: QuestionConfig,
): MathQuestion {
  const subtype = pickSubtype(tier, history, config);

  // Try up to 20 times to generate a non-duplicate question
  for (let attempt = 0; attempt < 20; attempt++) {
    const q = generateBySubtype(subtype, tier);
    if (!history.keys.includes(q.key)) {
      return q;
    }
  }
  // Fallback: return the last generated question even if duplicate
  return generateBySubtype(subtype, tier);
}

/**
 * Choose which subtype to generate next.
 * Uses configurable weights (e.g. 60% mul / 40% add for easy) with an
 * anti-streak override: if the last N questions all used the same subtype,
 * force the other one to ensure variety.
 */
function pickSubtype(
  tier: Tier,
  history: QuestionHistory,
  config: QuestionConfig,
): QuestionSubtype {
  const subtypes: QuestionSubtype[] =
    tier === "easy"
      ? ["small_mul", "add_no_carry", "small_div"]
      : ["large_mul", "add_carry", "large_div"];

  const weights =
    tier === "easy"
      ? [config.easySubtypeWeights.small_mul, config.easySubtypeWeights.add_no_carry, config.easySubtypeWeights.small_div]
      : [config.hardSubtypeWeights.large_mul, config.hardSubtypeWeights.add_carry, config.hardSubtypeWeights.large_div];

  // Anti-streak: if last N subtypes are all the same, exclude that subtype
  const streak = config.maxSameSubtypeStreak;
  if (
    history.subtypes.length >= streak &&
    history.subtypes.slice(-streak).every((s) => s === history.subtypes[history.subtypes.length - 1])
  ) {
    const excluded = history.subtypes[history.subtypes.length - 1];
    const filteredSubtypes = subtypes.filter((s) => s !== excluded);
    const filteredWeights = weights.filter((_, i) => subtypes[i] !== excluded);
    if (filteredSubtypes.length > 0) {
      return weightedRandom(filteredSubtypes, filteredWeights);
    }
  }

  return weightedRandom(subtypes, weights);
}

function generateBySubtype(subtype: QuestionSubtype, tier: Tier): MathQuestion {
  switch (subtype) {
    case "small_mul":
      return generateSmallMul(tier);
    case "add_no_carry":
      return generateAddNoCarry(tier);
    case "small_div":
      return generateSmallDiv(tier);
    case "large_mul":
      return generateLargeMul(tier);
    case "add_carry":
      return generateAddCarry(tier);
    case "large_div":
      return generateLargeDiv(tier);
  }
}

// ── Small multiplication: a × b, a,b ∈ [1..10], canonical a ≤ b ──
/** Factors are canonicalized (a ≤ b) so the key "mul:3:7" is stable. */

function generateSmallMul(tier: Tier): MathQuestion {
  let a = randInt(1, 10);
  let b = randInt(1, 10);
  if (a > b) [a, b] = [b, a];

  const correct = a * b;
  const wrong = multiplicationDistractor(a, b, correct);

  return {
    key: `mul:${a}:${b}`,
    text: `${a} × ${b} =`,
    correctAnswer: correct,
    wrongAnswer: wrong,
    tier,
    subtype: "small_mul",
  };
}

// ── Large multiplication: a × b, one in [11..20], one in [1..10] ──
/** Exactly one factor is in [11..20], the other in [1..10]. */

function generateLargeMul(tier: Tier): MathQuestion {
  let a = randInt(1, 10);
  let b = randInt(11, 20);
  if (a > b) [a, b] = [b, a];

  const correct = a * b;
  const wrong = multiplicationDistractor(a, b, correct);

  return {
    key: `mul:${a}:${b}`,
    text: `${a} × ${b} =`,
    correctAnswer: correct,
    wrongAnswer: wrong,
    tier,
    subtype: "large_mul",
  };
}

// ── Addition without carry: a + b, a ∈ [0..99], b ∈ [1..9], (a%10)+b ≤ 9
/** Unit digits stay below 10, so no carry is needed. Easier mental math. */

function generateAddNoCarry(tier: Tier): MathQuestion {
  const b = randInt(1, 9);
  // a's unit digit must be ≤ 9 - b
  const maxUnit = 9 - b;
  const tens = randInt(0, 9); // 0..9 → a in [0..99]
  const unit = randInt(0, maxUnit);
  const a = tens * 10 + unit;

  const correct = a + b;
  const wrong = additionDistractor(correct);

  return {
    key: `add:${a}:${b}`,
    text: `${a} + ${b} =`,
    correctAnswer: correct,
    wrongAnswer: wrong,
    tier,
    subtype: "add_no_carry",
  };
}

// ── Addition with carry: a + b, a ∈ [10..99], b ∈ [1..9], (a%10)+b ≥ 10
/** Unit digits sum to ≥ 10, forcing a carry into the tens place. */

function generateAddCarry(tier: Tier): MathQuestion {
  const b = randInt(1, 9);
  // a's unit digit must be ≥ 10 - b
  const minUnit = 10 - b;
  const tens = randInt(1, 9); // 1..9 → a in [10..99]
  const unit = randInt(minUnit, 9);
  const a = tens * 10 + unit;

  const correct = a + b;
  const wrong = additionDistractor(correct);

  return {
    key: `add:${a}:${b}`,
    text: `${a} + ${b} =`,
    correctAnswer: correct,
    wrongAnswer: wrong,
    tier,
    subtype: "add_carry",
  };
}

// ── Small division: p : a = b, where a,b ∈ [2..5], p = a × b ──────
/** Pick two factors from [2..5], compute product, ask product ÷ one of them. */

function generateSmallDiv(tier: Tier): MathQuestion {
  const a = randInt(2, 5);
  const b = randInt(2, 5);
  const p = a * b;

  // Randomly choose which factor is the divisor
  const [divisor, answer] = Math.random() < 0.5 ? [a, b] : [b, a];
  const wrong = divisionDistractor(answer);

  return {
    key: `div:${p}:${divisor}`,
    text: `${p} : ${divisor} =`,
    correctAnswer: answer,
    wrongAnswer: wrong,
    tier,
    subtype: "small_div",
  };
}

// ── Large division: p : a = b, where a ∈ [2..10], b ∈ [5..10] ────
/** One factor from [2..10], the other from [5..10]. Larger products. */

function generateLargeDiv(tier: Tier): MathQuestion {
  const a = randInt(2, 10);
  const b = randInt(5, 10);
  const p = a * b;

  const [divisor, answer] = Math.random() < 0.5 ? [a, b] : [b, a];
  const wrong = divisionDistractor(answer);

  return {
    key: `div:${p}:${divisor}`,
    text: `${p} : ${divisor} =`,
    correctAnswer: answer,
    wrongAnswer: wrong,
    tier,
    subtype: "large_div",
  };
}

// ── Distractors ─────────────────────────────────────────────────────

/**
 * Multiplication distractor: shift one factor by ±1 and multiply.
 * Produces a "nearby" wrong answer that mimics confusing adjacent rows
 * in a multiplication table.
 * E.g. for 6×7=42, candidates are: 5×7=35, 7×7=49, 6×6=36, 6×8=48.
 */
function multiplicationDistractor(a: number, b: number, correct: number): number {
  // Try shifting each factor ±1, collect valid candidates
  const candidates: number[] = [];

  for (const [base, other] of [[a, b], [b, a]]) {
    for (const delta of [-1, 1]) {
      const shifted = base + delta;
      if (shifted >= 1) {
        const result = shifted * other;
        if (result !== correct && result > 0) {
          candidates.push(result);
        }
      }
    }
  }

  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Absolute fallback (should never happen for valid inputs)
  return correct + 1;
}

/**
 * Addition distractor: correct ± 1 or ± 10.
 * Simulates the two most common mental-math errors: miscounting units
 * or miscounting tens (e.g. forgetting or double-applying the carry).
 */
function additionDistractor(correct: number): number {
  const candidates = [
    correct - 10,
    correct + 10,
    correct - 1,
    correct + 1,
  ].filter((c) => c >= 0 && c !== correct);

  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  return correct + 1;
}

/**
 * Division distractor: answer ± 1 (off-by-one in the quotient).
 * For small quotients the adjacent value is a convincing mistake,
 * e.g. 20 : 4 = 5, distractor 4 or 6.
 */
function divisionDistractor(answer: number): number {
  const candidates = [answer - 1, answer + 1].filter((c) => c > 0 && c !== answer);
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return answer + 1;
}

// ── Utilities ───────────────────────────────────────────────────────

/** Inclusive random integer in [min, max]. */
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Pick one item using unnormalized weights (e.g. [60, 40]). */
function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
