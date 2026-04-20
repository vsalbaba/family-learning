import type { MathQuestion, QuestionConfig, QuestionSubtype, TaskPair, Tier } from "./types";

// ── Public API ──────────────────────────────────────────────────────

export interface QuestionHistory {
  keys: string[]; // last N question keys (oldest first)
  subtypes: QuestionSubtype[]; // last N subtypes (oldest first)
}

export function createEmptyHistory(): QuestionHistory {
  return { keys: [], subtypes: [] };
}

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

/** Push a question into history, maintaining maxSize. */
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

function pickSubtype(
  tier: Tier,
  history: QuestionHistory,
  config: QuestionConfig,
): QuestionSubtype {
  const subtypes: QuestionSubtype[] =
    tier === "easy"
      ? ["small_mul", "add_no_carry"]
      : ["large_mul", "add_carry"];

  const weights =
    tier === "easy"
      ? [config.easySubtypeWeights.small_mul, config.easySubtypeWeights.add_no_carry]
      : [config.hardSubtypeWeights.large_mul, config.hardSubtypeWeights.add_carry];

  // Anti-streak: if last N subtypes are all the same, force the other
  const streak = config.maxSameSubtypeStreak;
  if (
    history.subtypes.length >= streak &&
    history.subtypes.slice(-streak).every((s) => s === history.subtypes[history.subtypes.length - 1])
  ) {
    const forced = subtypes.find((s) => s !== history.subtypes[history.subtypes.length - 1]);
    if (forced) return forced;
  }

  return weightedRandom(subtypes, weights);
}

function generateBySubtype(subtype: QuestionSubtype, tier: Tier): MathQuestion {
  switch (subtype) {
    case "small_mul":
      return generateSmallMul(tier);
    case "add_no_carry":
      return generateAddNoCarry(tier);
    case "large_mul":
      return generateLargeMul(tier);
    case "add_carry":
      return generateAddCarry(tier);
  }
}

// ── Small multiplication: a × b, a,b ∈ [1..10], canonical a ≤ b ──

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

// ── Large multiplication: a × b, a,b ∈ [1..20], ≥1 in [11..20] ──

function generateLargeMul(tier: Tier): MathQuestion {
  // Ensure at least one factor is in [11..20]
  let a: number;
  let b: number;
  if (Math.random() < 0.5) {
    a = randInt(11, 20);
    b = randInt(1, 20);
  } else {
    a = randInt(1, 20);
    b = randInt(11, 20);
  }
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

// ── Distractors ─────────────────────────────────────────────────────

/**
 * Multiplication distractor: adjacent multiple of one factor.
 * E.g. for 6×7=42, distractor might be 6×8=48 or 5×7=35.
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
 * Addition distractor: ±1 or ±10 from correct answer.
 * Simulates unit-digit or tens-digit errors.
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

// ── Utilities ───────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
