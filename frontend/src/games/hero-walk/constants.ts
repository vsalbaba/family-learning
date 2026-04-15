import type { Direction } from "./types";

export const GRID_W = 6;
export const GRID_H = 6;
export const MAX_COMMANDS = 30;
export const STEP_DELAY_MS = 400;
export const RESULT_DELAY_MS = 800;
export const MIN_SOLUTION = 5;
export const MAX_SOLUTION = 10;

export const DIR_DELTA: Record<Direction, [number, number]> = {
  N: [-1, 0],
  E: [0, 1],
  S: [1, 0],
  W: [0, -1],
};

export const LEFT: Record<Direction, Direction> = {
  N: "W",
  W: "S",
  S: "E",
  E: "N",
};

export const RIGHT: Record<Direction, Direction> = {
  N: "E",
  E: "S",
  S: "W",
  W: "N",
};
