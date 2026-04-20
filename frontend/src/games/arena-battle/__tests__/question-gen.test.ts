import { describe, it, expect } from "vitest";
import {
  generateTaskPair,
  createEmptyHistory,
  pushHistory,
  type QuestionHistory,
} from "../question-gen";
import type { QuestionConfig, MathQuestion } from "../types";

const DEFAULT_CONFIG: QuestionConfig = {
  easySubtypeWeights: { small_mul: 60, add_no_carry: 40 },
  hardSubtypeWeights: { large_mul: 50, add_carry: 50 },
  recentHistorySize: 3,
  maxSameSubtypeStreak: 2,
  factor1Weight: 0.2,
};

function generate(n: number, config = DEFAULT_CONFIG) {
  const easyHist = createEmptyHistory();
  const hardHist = createEmptyHistory();
  const pairs = [];
  for (let i = 0; i < n; i++) {
    const pair = generateTaskPair(easyHist, hardHist, config);
    pushHistory(easyHist, pair.easy, config.recentHistorySize);
    pushHistory(hardHist, pair.hard, config.recentHistorySize);
    pairs.push(pair);
  }
  return { pairs, easyHist, hardHist };
}

// ── Basic structure ─────────────────────────────────────────────────

describe("TaskPair structure", () => {
  it("returns easy and hard questions", () => {
    const { pairs } = generate(1);
    const pair = pairs[0];
    expect(pair.easy.tier).toBe("easy");
    expect(pair.hard.tier).toBe("hard");
  });

  it("easy question has valid subtype", () => {
    const { pairs } = generate(20);
    for (const p of pairs) {
      expect(["small_mul", "add_no_carry"]).toContain(p.easy.subtype);
    }
  });

  it("hard question has valid subtype", () => {
    const { pairs } = generate(20);
    for (const p of pairs) {
      expect(["large_mul", "add_carry"]).toContain(p.hard.subtype);
    }
  });
});

// ── Question key format ─────────────────────────────────────────────

describe("Question keys", () => {
  it("multiplication keys have canonical order (a ≤ b)", () => {
    const { pairs } = generate(50);
    for (const p of pairs) {
      for (const q of [p.easy, p.hard]) {
        if (q.key.startsWith("mul:")) {
          const [, aStr, bStr] = q.key.split(":");
          expect(Number(aStr)).toBeLessThanOrEqual(Number(bStr));
        }
      }
    }
  });

  it("keys are stable identifiers starting with mul: or add:", () => {
    const { pairs } = generate(20);
    for (const p of pairs) {
      for (const q of [p.easy, p.hard]) {
        expect(q.key).toMatch(/^(mul|add):\d+:\d+$/);
      }
    }
  });
});

// ── Correct answers ─────────────────────────────────────────────────

describe("Correct answers", () => {
  it("multiplication answers are correct", () => {
    const { pairs } = generate(50);
    for (const p of pairs) {
      for (const q of [p.easy, p.hard]) {
        if (q.key.startsWith("mul:")) {
          const [, a, b] = q.key.split(":").map(Number);
          expect(q.correctAnswer).toBe(a * b);
        }
      }
    }
  });

  it("addition answers are correct", () => {
    const { pairs } = generate(50);
    for (const p of pairs) {
      for (const q of [p.easy, p.hard]) {
        if (q.key.startsWith("add:")) {
          const [, a, b] = q.key.split(":").map(Number);
          expect(q.correctAnswer).toBe(a + b);
        }
      }
    }
  });
});

// ── Distractor invariants ───────────────────────────────────────────

describe("Distractors", () => {
  it("distractor is never equal to correct answer", () => {
    const { pairs } = generate(100);
    for (const p of pairs) {
      for (const q of [p.easy, p.hard]) {
        expect(q.wrongAnswer).not.toBe(q.correctAnswer);
      }
    }
  });

  it("distractor is always positive", () => {
    const { pairs } = generate(100);
    for (const p of pairs) {
      for (const q of [p.easy, p.hard]) {
        expect(q.wrongAnswer).toBeGreaterThan(0);
      }
    }
  });

  it("multiplication distractor is an adjacent multiple", () => {
    const { pairs } = generate(100);
    for (const p of pairs) {
      for (const q of [p.easy, p.hard]) {
        if (!q.key.startsWith("mul:")) continue;
        const [, a, b] = q.key.split(":").map(Number);
        // Distractor should be (a±1)*b or a*(b±1)
        const validDistr = new Set([
          (a - 1) * b,
          (a + 1) * b,
          a * (b - 1),
          a * (b + 1),
        ]);
        // Filter invalid values
        validDistr.delete(a * b); // can't equal correct
        for (const v of validDistr) {
          if (v <= 0) validDistr.delete(v);
        }
        expect(validDistr.has(q.wrongAnswer)).toBe(true);
      }
    }
  });

  it("addition distractor is ±1 or ±10 from correct", () => {
    const { pairs } = generate(100);
    for (const p of pairs) {
      for (const q of [p.easy, p.hard]) {
        if (!q.key.startsWith("add:")) continue;
        const diff = Math.abs(q.wrongAnswer - q.correctAnswer);
        expect([1, 10]).toContain(diff);
      }
    }
  });
});

// ── Domain constraints ──────────────────────────────────────────────

describe("Domain constraints", () => {
  it("small_mul: factors in [1..10]", () => {
    const { pairs } = generate(50);
    for (const p of pairs) {
      if (p.easy.subtype !== "small_mul") continue;
      const [, a, b] = p.easy.key.split(":").map(Number);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(10);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(10);
    }
  });

  it("large_mul: at least one factor in [11..20]", () => {
    const { pairs } = generate(50);
    for (const p of pairs) {
      if (p.hard.subtype !== "large_mul") continue;
      const [, a, b] = p.hard.key.split(":").map(Number);
      expect(a >= 11 || b >= 11).toBe(true);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(20);
    }
  });

  it("add_no_carry: (a mod 10) + b ≤ 9", () => {
    const { pairs } = generate(50);
    for (const p of pairs) {
      if (p.easy.subtype !== "add_no_carry") continue;
      const [, a, b] = p.easy.key.split(":").map(Number);
      expect((a % 10) + b).toBeLessThanOrEqual(9);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(9);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(99);
    }
  });

  it("add_carry: (a mod 10) + b ≥ 10", () => {
    const { pairs } = generate(50);
    for (const p of pairs) {
      if (p.hard.subtype !== "add_carry") continue;
      const [, a, b] = p.hard.key.split(":").map(Number);
      expect((a % 10) + b).toBeGreaterThanOrEqual(10);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(9);
      expect(a).toBeGreaterThanOrEqual(10);
      expect(a).toBeLessThanOrEqual(99);
    }
  });
});

// ── Anti-repetition ─────────────────────────────────────────────────

describe("Anti-repetition", () => {
  it("produces variety in easy pool keys", () => {
    const { pairs } = generate(30);
    const easyKeys = pairs.map((p) => p.easy.key);
    const uniqueKeys = new Set(easyKeys);
    expect(uniqueKeys.size).toBeGreaterThan(3);
  });

  it("anti-streak: no more than 2 same subtypes in a row (easy)", () => {
    const { pairs } = generate(50);
    for (let i = 2; i < pairs.length; i++) {
      const s0 = pairs[i - 2].easy.subtype;
      const s1 = pairs[i - 1].easy.subtype;
      const s2 = pairs[i].easy.subtype;
      // If the previous 2 were the same, the third must differ
      if (s0 === s1) {
        expect(s2).not.toBe(s0);
      }
    }
  });

  it("anti-streak: no more than 2 same subtypes in a row (hard)", () => {
    const { pairs } = generate(50);
    for (let i = 2; i < pairs.length; i++) {
      const s0 = pairs[i - 2].hard.subtype;
      const s1 = pairs[i - 1].hard.subtype;
      const s2 = pairs[i].hard.subtype;
      if (s0 === s1) {
        expect(s2).not.toBe(s0);
      }
    }
  });
});

// ── Subtype distribution ────────────────────────────────────────────

describe("Subtype distribution", () => {
  it("easy pool produces both subtypes", () => {
    const { pairs } = generate(50);
    const subtypes = new Set(pairs.map((p) => p.easy.subtype));
    expect(subtypes.has("small_mul")).toBe(true);
    expect(subtypes.has("add_no_carry")).toBe(true);
  });

  it("hard pool produces both subtypes", () => {
    const { pairs } = generate(50);
    const subtypes = new Set(pairs.map((p) => p.hard.subtype));
    expect(subtypes.has("large_mul")).toBe(true);
    expect(subtypes.has("add_carry")).toBe(true);
  });
});

// ── History management ──────────────────────────────────────────────

describe("pushHistory", () => {
  it("maintains max size", () => {
    const history: QuestionHistory = createEmptyHistory();
    const fakeQ = (key: string): MathQuestion => ({
      key,
      text: "",
      correctAnswer: 0,
      wrongAnswer: 1,
      tier: "easy",
      subtype: "small_mul",
    });

    pushHistory(history, fakeQ("a"), 3);
    pushHistory(history, fakeQ("b"), 3);
    pushHistory(history, fakeQ("c"), 3);
    pushHistory(history, fakeQ("d"), 3);

    expect(history.keys).toEqual(["b", "c", "d"]);
    expect(history.keys.length).toBe(3);
  });
});
