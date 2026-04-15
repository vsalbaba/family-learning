import type {
  GameMap,
  Command,
  Direction,
  Position,
  Terrain,
  Enemy,
  Trace,
  TraceStep,
} from "./types";
import {
  GRID_W,
  GRID_H,
  MIN_SOLUTION,
  MAX_SOLUTION,
  DIR_DELTA,
  LEFT,
  RIGHT,
} from "./constants";
import { solve } from "./solver";

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function posKey(pos: Position): string {
  return `${pos.row},${pos.col}`;
}

function inBounds(pos: Position): boolean {
  return pos.row >= 0 && pos.row < GRID_H && pos.col >= 0 && pos.col < GRID_W;
}

function posEq(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

const ALL_DIRS: Direction[] = ["N", "E", "S", "W"];

function isTurn(cmd: Command): boolean {
  return cmd === "turnLeft" || cmd === "turnRight";
}

function pickCommand(
  steps: TraceStep[],
  stepsRemaining: number,
): Command {
  const len = steps.length;
  const lastCmd = len > 0 ? steps[len - 1].command : null;
  const secondLastCmd = len > 1 ? steps[len - 2].command : null;

  // First command must be forward
  if (len === 0) return "forward";

  // Last command must be forward (hero steps onto princess)
  if (stepsRemaining === 1) return "forward";

  // After attack, next must be forward (attack+forward micro-segment)
  if (lastCmd === "attack") return "forward";

  const attackCount = steps.filter((s) => s.command === "attack").length;

  for (;;) {
    const r = Math.random();
    let cmd: Command;
    if (r < 0.5) cmd = "forward";
    else if (r < 0.65) cmd = "turnLeft";
    else if (r < 0.8) cmd = "turnRight";
    else cmd = "attack";

    // Max 2 consecutive turns
    if (isTurn(cmd) && isTurn(lastCmd!) && isTurn(secondLastCmd!)) continue;

    // Max 2 attacks total
    if (cmd === "attack" && attackCount >= 2) continue;

    // Attack + forced forward = 2 steps. If stepsRemaining === 2, the forced
    // forward would be the last step (princess arrival), placing princess on
    // the enemy cell. Block attack when stepsRemaining <= 2.
    if (cmd === "attack" && stepsRemaining <= 2) continue;

    return cmd;
  }
}

function buildTrace(): Trace | null {
  const length = randomInt(MIN_SOLUTION, MAX_SOLUTION);
  const startPos: Position = {
    row: randomInt(0, GRID_H - 1),
    col: randomInt(0, GRID_W - 1),
  };
  const startDir = ALL_DIRS[randomInt(0, 3)];

  let pos = { ...startPos };
  let dir = startDir;
  const steps: TraceStep[] = [];
  const reserved = new Set<string>();
  reserved.add(posKey(startPos));

  // Track which reserved keys are enemy cells
  const enemyCells = new Set<string>();

  while (steps.length < length) {
    const stepsRemaining = length - steps.length;

    // Try to place a command; if it fails spatially, re-pick (max 10 retries)
    let placed = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const cmd = pickCommand(steps, stepsRemaining);

      const beforePos = { ...pos };
      const beforeDir = dir;
      let attackTarget: Position | null = null;
      let newPos = { ...pos };
      let newDir = dir;

      switch (cmd) {
        case "turnLeft":
          newDir = LEFT[dir];
          break;

        case "turnRight":
          newDir = RIGHT[dir];
          break;

        case "forward": {
          const [dr, dc] = DIR_DELTA[dir];
          const next: Position = { row: pos.row + dr, col: pos.col + dc };
          if (!inBounds(next)) return null;
          const nk = posKey(next);
          if (enemyCells.has(nk)) {
            // Allow walking through if we just killed this enemy (attack+forward micro-segment)
            const prev = steps.length > 0 ? steps[steps.length - 1] : null;
            if (
              prev?.command === "attack" &&
              prev.attackTarget &&
              posKey(prev.attackTarget) === nk
            ) {
              enemyCells.delete(nk);
            } else {
              return null;
            }
          }
          newPos = next;
          break;
        }

        case "attack": {
          const [dr, dc] = DIR_DELTA[dir];
          const target: Position = { row: pos.row + dr, col: pos.col + dc };
          const tk = inBounds(target) ? posKey(target) : null;
          if (!tk || reserved.has(tk)) {
            // Attack target invalid — re-pick a different command
            continue;
          }
          attackTarget = { ...target };
          enemyCells.add(tk);
          reserved.add(tk);
          break;
        }
      }

      pos = newPos;
      dir = newDir;
      reserved.add(posKey(pos));

      steps.push({
        command: cmd,
        beforePos,
        beforeDir,
        afterPos: { ...pos },
        afterDir: dir,
        attackTarget,
      });
      placed = true;
      break;
    }

    if (!placed) {
      // Couldn't find a valid command after retries — abandon trace
      return null;
    }
  }

  return { startPos, startDir, steps };
}

function buildMapFromTrace(trace: Trace): GameMap {
  const terrain: Terrain[][] = Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => "empty" as Terrain),
  );

  const heroStart = { ...trace.startPos };
  const heroDir = trace.startDir;
  const princessPos = { ...trace.steps[trace.steps.length - 1].afterPos };

  const enemies: Enemy[] = [];
  let enemyId = 0;
  for (const step of trace.steps) {
    if (step.command === "attack" && step.attackTarget) {
      enemies.push({
        id: enemyId++,
        pos: { ...step.attackTarget },
        alive: true,
      });
    }
  }

  // Treasure on a random intermediate hero position (not start, not princess, not enemy)
  const enemyKeys = new Set(enemies.map((e) => posKey(e.pos)));
  const heroPositions = trace.steps
    .map((s) => s.afterPos)
    .filter(
      (p) =>
        !posEq(p, heroStart) &&
        !posEq(p, princessPos) &&
        !enemyKeys.has(posKey(p)),
    );

  // Deduplicate
  const seen = new Set<string>();
  const uniquePositions = heroPositions.filter((p) => {
    const k = posKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  let treasurePos: Position | null = null;
  if (uniquePositions.length > 0) {
    treasurePos = {
      ...uniquePositions[randomInt(0, uniquePositions.length - 1)],
    };
  }

  return {
    width: 6,
    height: 6,
    terrain,
    heroStart,
    heroDir,
    princessPos,
    treasurePos,
    enemies,
  };
}

function addBoulders(map: GameMap, trace: Trace): void {
  // Protected cells
  const pathCells = new Set<string>();
  pathCells.add(posKey(trace.startPos));
  for (const step of trace.steps) {
    pathCells.add(posKey(step.afterPos));
  }

  const allProtected = new Set<string>(pathCells);
  allProtected.add(posKey(map.princessPos));
  if (map.treasurePos) allProtected.add(posKey(map.treasurePos));
  for (const e of map.enemies) allProtected.add(posKey(e.pos));

  // Candidate cells
  const candidates: Position[] = [];
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const k = `${r},${c}`;
      if (!allProtected.has(k)) {
        candidates.push({ row: r, col: c });
      }
    }
  }

  // Bounding box of start ↔ princess
  const minR = Math.min(map.heroStart.row, map.princessPos.row);
  const maxR = Math.max(map.heroStart.row, map.princessPos.row);
  const minC = Math.min(map.heroStart.col, map.princessPos.col);
  const maxC = Math.max(map.heroStart.col, map.princessPos.col);

  // Score candidates: prefer anti-shortcut positions
  const scored = candidates.map((cell) => {
    let score = 0;

    // Adjacent to main path? (+3)
    for (const [dr, dc] of Object.values(DIR_DELTA)) {
      const neighbor: Position = { row: cell.row + dr, col: cell.col + dc };
      if (pathCells.has(posKey(neighbor))) {
        score += 3;
        break; // count adjacency once
      }
    }

    // Inside bounding box? (+2)
    if (
      cell.row >= minR &&
      cell.row <= maxR &&
      cell.col >= minC &&
      cell.col <= maxC
    ) {
      score += 2;
    }

    // Randomness to vary maps
    score += Math.random();

    return { cell, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const boulderCount = randomInt(2, 6);
  const toPlace = Math.min(boulderCount, scored.length);
  for (let i = 0; i < toPlace; i++) {
    const { cell } = scored[i];
    map.terrain[cell.row][cell.col] = "boulder";
  }
}

export function generateMap(): GameMap {
  for (let attempt = 0; attempt < 100; attempt++) {
    const trace = buildTrace();
    if (!trace) continue;

    const map = buildMapFromTrace(trace);
    addBoulders(map, trace);

    const solutionLength = solve(map);
    if (
      solutionLength !== null &&
      solutionLength >= MIN_SOLUTION &&
      solutionLength <= MAX_SOLUTION
    ) {
      return map;
    }
  }

  // Fallback: minimal map — straight line, no boulders
  const terrain: Terrain[][] = Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => "empty" as Terrain),
  );
  return {
    width: 6,
    height: 6,
    terrain,
    heroStart: { row: 0, col: 0 },
    heroDir: "E",
    princessPos: { row: 0, col: 5 },
    treasurePos: { row: 0, col: 2 },
    enemies: [{ id: 0, pos: { row: 0, col: 3 }, alive: true }],
  };
}
