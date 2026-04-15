import type {
  GameMap,
  Command,
  HeroState,
  StepResult,
  SimulationResult,
  Position,
  Enemy,
} from "./types";
import { DIR_DELTA, LEFT, RIGHT, GRID_W, GRID_H } from "./constants";

function inBounds(pos: Position): boolean {
  return pos.row >= 0 && pos.row < GRID_H && pos.col >= 0 && pos.col < GRID_W;
}

function cellInFront(pos: Position, dir: HeroState["dir"]): Position {
  const [dr, dc] = DIR_DELTA[dir];
  return { row: pos.row + dr, col: pos.col + dc };
}

function posEq(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function findAliveEnemy(enemies: Enemy[], pos: Position): Enemy | undefined {
  return enemies.find((e) => e.alive && posEq(e.pos, pos));
}

export function simulate(
  map: GameMap,
  commands: Command[],
): SimulationResult {
  const hero: HeroState = {
    pos: { ...map.heroStart },
    dir: map.heroDir,
    treasureCollected: false,
  };
  const enemies: Enemy[] = map.enemies.map((e) => ({ ...e, pos: { ...e.pos } }));
  const steps: StepResult[] = [];

  for (const cmd of commands) {
    const step: StepResult = {
      command: cmd,
      hero: { pos: { ...hero.pos }, dir: hero.dir, treasureCollected: hero.treasureCollected },
      enemyKilled: null,
      treasurePickedUp: false,
      blocked: false,
    };

    switch (cmd) {
      case "turnLeft":
        hero.dir = LEFT[hero.dir];
        break;

      case "turnRight":
        hero.dir = RIGHT[hero.dir];
        break;

      case "forward": {
        const target = cellInFront(hero.pos, hero.dir);
        if (
          !inBounds(target) ||
          map.terrain[target.row][target.col] === "boulder" ||
          findAliveEnemy(enemies, target)
        ) {
          step.blocked = true;
        } else {
          hero.pos = target;
          if (
            map.treasurePos &&
            posEq(target, map.treasurePos) &&
            !hero.treasureCollected
          ) {
            hero.treasureCollected = true;
            step.treasurePickedUp = true;
          }
          if (posEq(target, map.princessPos)) {
            step.hero = {
              pos: { ...hero.pos },
              dir: hero.dir,
              treasureCollected: hero.treasureCollected,
            };
            steps.push(step);
            return {
              outcome: "win",
              steps,
              treasureCollected: hero.treasureCollected,
            };
          }
        }
        break;
      }

      case "attack": {
        const target = cellInFront(hero.pos, hero.dir);
        const enemy = inBounds(target) ? findAliveEnemy(enemies, target) : undefined;
        if (enemy) {
          enemy.alive = false;
          step.enemyKilled = { ...target };
        } else {
          step.blocked = true;
        }
        break;
      }
    }

    step.hero = {
      pos: { ...hero.pos },
      dir: hero.dir,
      treasureCollected: hero.treasureCollected,
    };
    steps.push(step);
  }

  return { outcome: "lose", steps, treasureCollected: hero.treasureCollected };
}
