import type { GameMap, HeroState, Enemy, Position } from "./types";
import { GRID_H, GRID_W } from "./constants";

interface Props {
  map: GameMap;
  heroState: HeroState;
  enemies: Enemy[];
  treasureVisible: boolean;
}

const DIR_ROTATION = { N: "0deg", E: "90deg", S: "180deg", W: "270deg" };

function posEq(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export default function Grid({ map, heroState, enemies, treasureVisible }: Props) {
  const cells: React.ReactNode[] = [];

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const pos: Position = { row: r, col: c };
      const isBoulder = map.terrain[r][c] === "boulder";
      const isHero = posEq(pos, heroState.pos);
      const isPrincess = posEq(pos, map.princessPos);
      const isEnemy = enemies.some((e) => e.alive && posEq(e.pos, pos));
      const isTreasure =
        treasureVisible && map.treasurePos && posEq(pos, map.treasurePos);

      let content = "";
      let className = "hw-cell";

      if (isHero) {
        content = "\u{1F9B8}"; // 🦸
        className += " hw-cell--hero";
      } else if (isPrincess) {
        content = "\u{1F478}"; // 👸
      } else if (isEnemy) {
        content = "\u{1F479}"; // 👹
      } else if (isTreasure) {
        content = "\u{1F48E}"; // 💎
      } else if (isBoulder) {
        content = "\u{1FAA8}"; // 🪨
        className += " hw-cell--boulder";
      }

      cells.push(
        <div key={`${r}-${c}`} className={className}>
          {isHero ? (
            <span
              style={{ display: "inline-block", transform: `rotate(${DIR_ROTATION[heroState.dir]})` }}
            >
              {content}
            </span>
          ) : (
            content
          )}
        </div>,
      );
    }
  }

  return <div className="hw-grid">{cells}</div>;
}
