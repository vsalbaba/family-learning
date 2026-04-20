/** App-wide configuration constants. */

export const LESSON = {
  /** Available question count options shown to the child before starting a lesson. */
  QUESTION_COUNT_OPTIONS: [3, 5, 10, 20],
} as const;

export const SCORE = {
  /** Score percentage at or above which the "great" emoji is shown. */
  GREAT_THRESHOLD: 80,
  /** Score percentage at or above which the "good" emoji is shown (below GREAT_THRESHOLD). */
  GOOD_THRESHOLD: 50,
} as const;

export const GAME = {
  /** Duration (ms) of the "game window expired" animation before hiding it. */
  EXPIRE_ANIMATION_MS: 2400,
} as const;
