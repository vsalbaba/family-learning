# Spaced Repetition (SM-2) — Design Doc

## Overview

Each (child, item) pair has a `ReviewState` row tracking mastery. The system decides which items to show in lessons (item selection) and updates mastery after each answer (review update). Both halves use the same `ReviewState` table but operate on different fields.

**Source files:**
- Review update: `backend/app/services/spaced_repetition.py`
- Item selection: `backend/app/services/lesson_engine.py`
- Model: `backend/app/models/review.py`

## ReviewState Model

```
ReviewState
  child_id        → User.id
  item_id         → Item.id
  status          "learning" | "known" | "review"   (default: "learning")
  ease_factor     float                              (default: 2.5)
  interval_days   int                                (default: 0)
  repetitions     int                                (default: 0)
  next_review_at  datetime | null
  last_reviewed_at datetime | null
```

Unique constraint on `(child_id, item_id)`. Indexes on `(child_id, next_review_at)` and `(child_id, status)`.

Rows are created lazily by `get_or_create_review()` — an item with no row is treated as "unknown" (never seen).

## Mastery States

| State | Stored as | Meaning |
|-------|-----------|---------|
| **unknown** | No ReviewState row (implicit) | Child has never seen this question |
| **learning** | `status = "learning"` | Has been seen, building reps toward mastery (1–2 correct) |
| **known** | `status = "known"` | Mastered (3+ consecutive correct answers) |
| **review** | `status = "review"` | Got it wrong after progress, needs remediation |

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
              │    ┌────────┐            │       │
              │    │ review │◀───────────┘       │
              │    └────────┘                    │
              │         │ correct ───────────────┘
              │         │   (rebuilds reps toward 3)
              └─────────┘
                wrong (resets reps to 0,
                 stays "review")
```

### Transition table (`update_review`)

| Event | reps before → after | status after | interval | ease_factor |
|-------|---------------------|--------------|----------|-------------|
| Correct, rep 1 | 0 → 1 | learning | 1 day | +0.1 |
| Correct, rep 2 | 1 → 2 | learning | 3 days | +0.1 |
| Correct, rep 3 | 2 → 3 | **known** | 7 days | +0.1 |
| Correct, rep 4+ | n → n+1 | known | `min(180, round(interval × ease))` | +0.1 |
| Wrong (any state) | any → 0 | **review** | 0 (immediate) | −0.2 (min 1.3) |

### Key properties

1. **Progression: unknown → learning → known.** An item stays "learning" through reps 1 and 2, then becomes "known" at rep 3.

2. **"review" is only set on wrong answers.** It means "was making progress, then got it wrong." It acts as a demotion state.

3. **Review → learning on first correct answer.** Any correct answer with reps < 3 explicitly sets status to "learning", so items recover from "review" immediately.

4. **Wrong answer sets `next_review_at = now`.** The item becomes immediately eligible for remediation in the next lesson.

5. **Ease factor is clamped to [1.3, 3.0].** Starts at 2.5, grows by +0.1 per correct, shrinks by −0.2 per wrong.

6. **`MAX_INTERVAL = 180` days.** The longest an item can go between reviews.

## Item Selection (Lesson Engine)

### Scheduling buckets

Each item is classified into one of four buckets based on its `ReviewState`:

| Bucket | Condition | Priority |
|--------|-----------|----------|
| **remediation** | `status == "review"` | Highest — wrong-answer items needing practice |
| **due** | `status != "review"` AND `next_review_at ≤ now` | High — overdue for scheduled review |
| **unseen** | No ReviewState row, OR `next_review_at` is null | Medium — never-seen items |
| **not_due** | `next_review_at > now` AND `status != "review"` | Lowest — filler when others run out |

### Budget allocation

For a lesson of size N, items are allocated by target fractions:

| Slot type | Target | Purpose |
|-----------|--------|---------|
| Review (remediation + due) | 40% of N | Prioritize items needing review |
| Unseen | 40% of N | Introduce never-seen items |
| Filler (not_due) | 20% of N | Pad with mastered items if needed |

Explicit budget table for common lesson sizes:

| Lesson size | Review max | Unseen target | Filler |
|-------------|-----------|---------------|--------|
| 3 | 1 | 1 | 1 |
| 5 | 2 | 2 | 1 |
| 7 | 3 | 3 | 1 |
| 10 | 4 | 4 | 2 |
| 20 | 8 | 8 | 4 |

Unused slots cascade: leftover review → unseen → filler → review.

### Scoring within buckets

Each item gets a score within its bucket. Higher score = selected first.

- **unseen**: `-sort_order + random(0, 10)` — roughly in package order with jitter
- **remediation**: `(2.5 − ease) × 100` + overdue bonus (`+50` if past `next_review_at`) + `random(0, 20)`
- **due**: `min(200, overdue_hours × 2)` + `(2.5 − ease) × 40` + `random(0, 20)`
- **not_due**: `-days_until_review` + `(2.5 − ease) × 20` + `random(0, 10)`

### Anti-repeat penalties

Items answered recently get score penalties to avoid repetition within a lesson cycle:

| Window | Penalty | Effect |
|--------|---------|--------|
| Within 6 hours | −1000 | Effectively excluded |
| Within 24 hours | −200 | Strongly deprioritized |

These penalties are applied to all buckets except in "all mode" (question_count ≥ 999).

### All mode (999)

When `question_count ≥ 999`, all items are returned ordered by bucket priority (remediation → due → unseen → not_due) with no budget limits and no anti-repeat penalties. Used for parent preview.

## Configuration

All tuning parameters are in `LessonConfig` (dataclass in `lesson_engine.py`):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `review_max_ratio` | 0.4 | Max fraction of slots for review items |
| `new_target_ratio` | 0.4 | Target fraction for unseen items |
| `anti_repeat_hard_hours` | 6 | Hard suppression window |
| `anti_repeat_soft_hours` | 24 | Soft suppression window |
| `anti_repeat_hard_penalty` | 1000 | Score penalty in hard window |
| `anti_repeat_soft_penalty` | 200 | Score penalty in soft window |
| `learning_ease_weight` | 100 | Ease factor weight for remediation scoring |
| `learning_overdue_bonus` | 50 | Bonus for overdue remediation items |
| `due_overdue_hours_weight` | 2 | Per-hour weight for due item scoring |
| `due_overdue_max_score` | 200 | Cap on due overdue score |
| `due_ease_weight` | 40 | Ease factor weight for due scoring |
| `not_due_ease_weight` | 20 | Ease factor weight for not-due scoring |
| `extension_question_count` | 10 | Questions added per lesson extension |
| `max_extensions` | 2 | Max lesson extensions allowed |

## Where it runs

- **Review update**: `lesson_engine.submit_answer()` → `get_or_create_review()` + `update_review()` — called on every answer submission.
- **Item selection**: `lesson_engine._build_from_items()` → `_classify_and_score()` — called when building a new lesson or extending one.
- **Progress display**: `children.py` `_build_progress_detail()` reads `ReviewState.status` to show mastery per item; items with no row are reported as `"unknown"`.
