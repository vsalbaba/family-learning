import { describe, it, expect } from "vitest";
import { generateMap } from "./mapgen";
import { simulate } from "./engine";
import { solve } from "./solver";
import { GRID_W, GRID_H, MIN_SOLUTION, MAX_SOLUTION } from "./constants";
import type { GameMap, Position } from "./types";

function posKey(p: Position): string {
  return `${p.row},${p.col}`;
}

function inBounds(p: Position): boolean {
  return p.row >= 0 && p.row < GRID_H && p.col >= 0 && p.col < GRID_W;
}

// Generate N maps for statistical tests
const SAMPLE_SIZE = 50;
const maps: GameMap[] = [];
for (let i = 0; i < SAMPLE_SIZE; i++) {
  maps.push(generateMap());
}

describe("generateMap — structural invariants", () => {
  it.each(maps.map((m, i) => [i, m]))(
    "map %i has correct grid dimensions",
    (_i, map) => {
      const m = map as GameMap;
      expect(m.terrain).toHaveLength(GRID_H);
      for (const row of m.terrain) {
        expect(row).toHaveLength(GRID_W);
      }
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i has hero start in bounds",
    (_i, map) => {
      expect(inBounds((map as GameMap).heroStart)).toBe(true);
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i has princess in bounds",
    (_i, map) => {
      expect(inBounds((map as GameMap).princessPos)).toBe(true);
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i has hero and princess on different cells",
    (_i, map) => {
      const m = map as GameMap;
      expect(posKey(m.heroStart)).not.toBe(posKey(m.princessPos));
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i has hero start on empty terrain",
    (_i, map) => {
      const m = map as GameMap;
      expect(m.terrain[m.heroStart.row][m.heroStart.col]).toBe("empty");
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i has princess on empty terrain",
    (_i, map) => {
      const m = map as GameMap;
      expect(m.terrain[m.princessPos.row][m.princessPos.col]).toBe("empty");
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i has all enemies in bounds and on empty terrain",
    (_i, map) => {
      const m = map as GameMap;
      for (const e of m.enemies) {
        expect(inBounds(e.pos)).toBe(true);
        expect(m.terrain[e.pos.row][e.pos.col]).toBe("empty");
      }
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i has no entity overlap",
    (_i, map) => {
      const m = map as GameMap;
      const occupied = new Set<string>();
      occupied.add(posKey(m.heroStart));
      occupied.add(posKey(m.princessPos));
      if (m.treasurePos) occupied.add(posKey(m.treasurePos));
      // hero + princess + treasure should all be distinct
      const expectedSize = 2 + (m.treasurePos ? 1 : 0);
      expect(occupied.size).toBe(expectedSize);
      // enemies should not overlap with each other or with hero/princess/treasure
      for (const e of m.enemies) {
        expect(occupied.has(posKey(e.pos))).toBe(false);
        occupied.add(posKey(e.pos));
      }
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i has enemies not on boulders",
    (_i, map) => {
      const m = map as GameMap;
      for (const e of m.enemies) {
        expect(m.terrain[e.pos.row][e.pos.col]).not.toBe("boulder");
      }
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i terrain contains only valid cell types",
    (_i, map) => {
      const m = map as GameMap;
      for (const row of m.terrain) {
        for (const cell of row) {
          expect(["empty", "boulder"]).toContain(cell);
        }
      }
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i has valid direction",
    (_i, map) => {
      expect(["N", "E", "S", "W"]).toContain((map as GameMap).heroDir);
    },
  );
});

describe("generateMap — solvability", () => {
  it.each(maps.map((m, i) => [i, m]))(
    "map %i is solvable by the solver",
    (_i, map) => {
      const length = solve(map as GameMap);
      expect(length).not.toBeNull();
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i has solution length between %i and %i",
    (_i, map) => {
      const length = solve(map as GameMap)!;
      expect(length).toBeGreaterThanOrEqual(MIN_SOLUTION);
      expect(length).toBeLessThanOrEqual(MAX_SOLUTION);
    },
  );

  it.each(maps.map((m, i) => [i, m]))(
    "map %i is winnable when solver solution is played through engine",
    (_i, map) => {
      // Use a brute-force BFS to find a winning command sequence
      // and verify the engine agrees
      const m = map as GameMap;
      const solution = findSolution(m);
      expect(solution).not.toBeNull();
      const result = simulate(m, solution!);
      expect(result.outcome).toBe("win");
    },
  );
});

describe("generateMap — statistical properties", () => {
  it("produces maps with boulders", () => {
    const withBoulders = maps.filter((m) =>
      m.terrain.some((row) => row.some((c) => c === "boulder")),
    );
    // At least 80% of maps should have boulders
    expect(withBoulders.length).toBeGreaterThanOrEqual(SAMPLE_SIZE * 0.8);
  });

  it("produces maps with enemies", () => {
    const withEnemies = maps.filter((m) => m.enemies.length > 0);
    // At least 20% of maps should have enemies
    expect(withEnemies.length).toBeGreaterThanOrEqual(SAMPLE_SIZE * 0.2);
  });

  it("produces maps with treasure", () => {
    const withTreasure = maps.filter((m) => m.treasurePos !== null);
    // At least 80% of maps should have treasure
    expect(withTreasure.length).toBeGreaterThanOrEqual(SAMPLE_SIZE * 0.8);
  });

  it("produces varied start positions", () => {
    const positions = new Set(maps.map((m) => posKey(m.heroStart)));
    // With 50 maps on a 6x6 grid, expect at least 5 distinct start positions
    expect(positions.size).toBeGreaterThanOrEqual(5);
  });

  it("produces varied princess positions", () => {
    const positions = new Set(maps.map((m) => posKey(m.princessPos)));
    expect(positions.size).toBeGreaterThanOrEqual(5);
  });

  it("produces varied solution lengths", () => {
    const lengths = new Set(maps.map((m) => solve(m)));
    // Should have at least 3 different solution lengths
    expect(lengths.size).toBeGreaterThanOrEqual(3);
  });
});

// Simple BFS that returns a winning command sequence, or null
function findSolution(map: GameMap): import("./types").Command[] | null {
  type State = {
    row: number;
    col: number;
    dir: "N" | "E" | "S" | "W";
    mask: number;
    commands: import("./types").Command[];
  };

  const deltas = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] } as const;
  const left = { N: "W", W: "S", S: "E", E: "N" } as const;
  const right = { N: "E", E: "S", S: "W", W: "N" } as const;
  const allCommands: import("./types").Command[] = [
    "forward",
    "turnLeft",
    "turnRight",
    "attack",
  ];

  const initialMask = (1 << map.enemies.length) - 1;
  const start: State = {
    row: map.heroStart.row,
    col: map.heroStart.col,
    dir: map.heroDir,
    mask: initialMask,
    commands: [],
  };

  const visited = new Set<string>();
  const key = (s: State) => `${s.row},${s.col},${s.dir},${s.mask}`;
  visited.add(key(start));

  const queue: State[] = [start];
  let head = 0;

  while (head < queue.length) {
    const s = queue[head++];

    for (const cmd of allCommands) {
      let nr = s.row,
        nc = s.col,
        nd = s.dir,
        nm = s.mask;

      switch (cmd) {
        case "turnLeft":
          nd = left[s.dir];
          break;
        case "turnRight":
          nd = right[s.dir];
          break;
        case "forward": {
          const [dr, dc] = deltas[s.dir];
          const tr = s.row + dr,
            tc = s.col + dc;
          if (
            tr < 0 ||
            tr >= GRID_H ||
            tc < 0 ||
            tc >= GRID_W ||
            map.terrain[tr][tc] === "boulder"
          )
            continue;
          const blocked = map.enemies.some(
            (e, i) =>
              (s.mask & (1 << i)) !== 0 &&
              e.pos.row === tr &&
              e.pos.col === tc,
          );
          if (blocked) continue;
          nr = tr;
          nc = tc;
          if (nr === map.princessPos.row && nc === map.princessPos.col) {
            return [...s.commands, cmd];
          }
          break;
        }
        case "attack": {
          const [dr, dc] = deltas[s.dir];
          const tr = s.row + dr,
            tc = s.col + dc;
          if (tr < 0 || tr >= GRID_H || tc < 0 || tc >= GRID_W) continue;
          const ei = map.enemies.findIndex(
            (e, i) =>
              (s.mask & (1 << i)) !== 0 &&
              e.pos.row === tr &&
              e.pos.col === tc,
          );
          if (ei === -1) continue;
          nm = s.mask & ~(1 << ei);
          break;
        }
      }

      const next: State = {
        row: nr,
        col: nc,
        dir: nd,
        mask: nm,
        commands: [...s.commands, cmd],
      };
      const k = key(next);
      if (!visited.has(k)) {
        visited.add(k);
        queue.push(next);
      }
    }
  }

  return null;
}
