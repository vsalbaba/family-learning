# Spaced Repetition (SM-2) — Design Doc

## Overview

Each (child, item) pair has a `ReviewState` row tracking mastery. The system decides which items to show in lessons (item selection) and updates mastery after each answer (review update). Both halves use the same `ReviewState` table but operate on different fields.

## ReviewState Model

```
ReviewState
  child_id     → User.id
  item_id      → Item.id
  status       "learning" | "known" | "review"   (default: "learning")
  ease_factor  float                              (default: 2.5)
  interval_days int                               (default: 0)
  repetitions  int                                (default: 0)
  next_review_at  datetime | null
  last_reviewed_at datetime | null
```

Unique constraint on `(child_id, item_id)`. Rows are created lazily — an item with no row is treated as "unknown" (never seen).

## Mastery States

| State | Stored as | Meaning |
|-------|-----------|---------|
| **unknown** | No ReviewState row (implicit) | Child never saw this question |
| **learning** | `status = "learning"` | Has been seen, building reps (1-2 correct) |
| **known** | `status = "known"` | Mastered (3+ correct reps) |
| **review** | `status = "review"` | Got it wrong, needs remediation |

## Status Transitions

```
                    correct (reps 1,2)
              ┌──────────────────────────┐
              │                          │
              ▼                          │
         ┌──────────┐  correct (rep 3) ┌──────┐
start ──▶│ learning │ ───────────────▶ │known │◀─┐
         └──────────┘                  └──────┘  │
              ▲                          │       │ correct (rep 3+)
              │                     wrong│       │
              │    ┌────────┐           │       │
              │    │ review │◀──────────┘       │
              │    └────────┘                   │
              │         │ correct ──────────────┘
              │         │   (rebuilds reps toward 3)
              └─────────┘
                wrong (resets reps to 0,
                 stays "review")
```

### Current behavior (code in `update_review`):

| Event | reps before | reps after | status after | interval | ease_factor |
|-------|-------------|------------|-------------|----------|-------------|
| Correct, reps 0→1 | 0 | 1 | **learning** | 1 day | +0.1 |
| Correct, reps 1→2 | 1 | 2 | **learning** | 3 days | +0.1 |
| Correct, reps 2→3 | 2 | 3 | **known** | 7 days | +0.1 |
| Correct, reps 3+ | n | n+1 | known | `min(180, interval × ease)` | +0.1 |
| Wrong (any state) | any | 0 | **review** | 0 | -0.2 (min 1.3) |

### Key observations

1. **Progression: unknown → learning → known.** An item stays "learning" through reps 1 and 2, then becomes "known" at rep 3.

2. **"review" is only set on wrong answers.** It means "was making progress, then got it wrong." It acts as a demotion state.

3. **Review → learning on first correct answer.** Any correct answer with reps < 3 explicitly sets status to "learning", ensuring items recover from "review" immediately.

4. **Ease factor is clamped to [1.3, 3.0].** It starts at 2.5, grows by 0.1 per correct answer, shrinks by 0.2 per wrong answer.

5. **`MAX_INTERVAL = 180` days.** The longest an item can go without review.

## Item Selection (Lesson Engine)

When building a lesson, each item is classified into one of four scheduling buckets based on its `ReviewState`:

| Bucket | Condition | Priority |
|--------|-----------|----------|
| **remediation** | `status == "review"` | Highest — these items need remediation |
| **due** | `status != "review"` AND `next_review_at <= now` | High — overdue for review |
| **unseen** | No ReviewState row, OR `next_review_at` is null | Medium — never-seen items |
| **not_due** | `next_review_at > now` AND `status != "review"` | Lowest — filler when others run out |

### Budget allocation

For a lesson of size N:

| Slot type | Target fraction | Purpose |
|-----------|----------------|---------|
| Review (remediation + due) | 40% | Prioritize items needing review |
| Unseen | 40% | Introduce never-seen items |
| Filler (not_due) | 20% | Pad with known items if needed |

Unused slots cascade: leftover review slots → unseen → filler → review.

### Scoring within buckets

Each item gets a score within its bucket. Higher score = selected first.

- **unseen**: `-sort_order + random(0,10)` — roughly in package order with jitter
- **remediation**: lower ease = higher score, overdue bonus (+50), random jitter
- **due**: overdue hours × 2 (capped at 200), lower ease = higher score
- **not_due**: closer review date = higher score, lower ease = higher score

### Anti-repeat penalties

Items answered recently get score penalties to avoid back-to-back repetition:

- Within 6 hours: -1000 (effectively excluded)
- Within 24 hours: -200 (strongly deprioritized)

## Where it runs

- **Review update**: `lesson_engine.submit_answer()` → `get_or_create_review()` + `update_review()` — called on every answer submission.
- **Item selection**: `lesson_engine._build_from_items()` → `_classify_and_score()` — called when building a new lesson.
