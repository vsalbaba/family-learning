import type { GameMap, Direction, Position } from "./types";
import { DIR_DELTA, LEFT, RIGHT, GRID_W, GRID_H } from "./constants";

function inBounds(pos: Position): boolean {
  return pos.row >= 0 && pos.row < GRID_H && pos.col >= 0 && pos.col < GRID_W;
}

function posEq(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

interface SolverState {
  row: number;
  col: number;
  dir: Direction;
  mask: number; // bitmask of alive enemies
}

function stateKey(s: SolverState): string {
  return `${s.row},${s.col},${s.dir},${s.mask}`;
}

/**
 * BFS solver: finds shortest effective path length from hero to princess.
 * Never expands no-op actions (forward into wall, attack on empty).
 * Returns step count or null if unsolvable.
 */
export function solve(map: GameMap): number | null {
  const enemyCount = map.enemies.length;
  const initialMask = (1 << enemyCount) - 1; // all alive

  const start: SolverState = {
    row: map.heroStart.row,
    col: map.heroStart.col,
    dir: map.heroDir,
    mask: initialMask,
  };

  const visited = new Set<string>();
  visited.add(stateKey(start));

  const queue: { state: SolverState; cost: number }[] = [
    { state: start, cost: 0 },
  ];

  let head = 0;
  while (head < queue.length) {
    const { state, cost } = queue[head++];

    // Try turnLeft
    {
      const next: SolverState = {
        row: state.row,
        col: state.col,
        dir: LEFT[state.dir],
        mask: state.mask,
      };
      const key = stateKey(next);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ state: next, cost: cost + 1 });
      }
    }

    // Try turnRight
    {
      const next: SolverState = {
        row: state.row,
        col: state.col,
        dir: RIGHT[state.dir],
        mask: state.mask,
      };
      const key = stateKey(next);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ state: next, cost: cost + 1 });
      }
    }

    // Try forward
    {
      const [dr, dc] = DIR_DELTA[state.dir];
      const tr = state.row + dr;
      const tc = state.col + dc;
      const target: Position = { row: tr, col: tc };

      if (inBounds(target) && map.terrain[tr][tc] !== "boulder") {
        // Check if alive enemy blocks
        const blocked = map.enemies.some(
          (e, i) => (state.mask & (1 << i)) !== 0 && posEq(e.pos, target),
        );
        if (!blocked) {
          if (posEq(target, map.princessPos)) {
            return cost + 1;
          }
          const next: SolverState = {
            row: tr,
            col: tc,
            dir: state.dir,
            mask: state.mask,
          };
          const key = stateKey(next);
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ state: next, cost: cost + 1 });
          }
        }
      }
    }

    // Try attack
    {
      const [dr, dc] = DIR_DELTA[state.dir];
      const tr = state.row + dr;
      const tc = state.col + dc;
      const target: Position = { row: tr, col: tc };

      if (inBounds(target)) {
        const enemyIdx = map.enemies.findIndex(
          (e, i) => (state.mask & (1 << i)) !== 0 && posEq(e.pos, target),
        );
        if (enemyIdx !== -1) {
          const next: SolverState = {
            row: state.row,
            col: state.col,
            dir: state.dir,
            mask: state.mask & ~(1 << enemyIdx),
          };
          const key = stateKey(next);
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ state: next, cost: cost + 1 });
          }
        }
      }
    }
  }

  return null;
}
