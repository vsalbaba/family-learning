import type { GameMap, HeroState, Enemy, Position } from "./types";
import { GRID_H, GRID_W } from "./constants";

export interface GridProps {
  map: GameMap;
  heroState: HeroState;
  enemies: Enemy[];
  treasureVisible: boolean;
  heroBlocked?: boolean;
  treasureCollecting?: boolean;
  winAnimation?: boolean;
}

const DIR_ROTATION = { N: "0deg", E: "90deg", S: "180deg", W: "270deg" };

function posEq(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export default function Grid({
  map,
  heroState,
  enemies,
  treasureVisible,
  heroBlocked,
  treasureCollecting,
  winAnimation,
}: GridProps) {
  const cells: React.ReactNode[] = [];

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const pos: Position = { row: r, col: c };
      const isBoulder = map.terrain[r][c] === "boulder";
      const isPrincess = posEq(pos, map.princessPos);
      const enemy = enemies.find((e) => posEq(e.pos, pos));
      const isAliveEnemy = enemy?.alive && !enemy?.dying;
      const isDyingEnemy = enemy?.dying;
      const isTreasure =
        treasureVisible && map.treasurePos && posEq(pos, map.treasurePos);

      let content = "";
      let className = "hw-cell";

      if (isPrincess) {
        content = "\u{1F478}";
        if (winAnimation) className += " hw-cell--win-princess";
      } else if (isDyingEnemy) {
        content = "\u{1F479}";
        className += " hw-cell--enemy-dying";
      } else if (isAliveEnemy) {
        content = "\u{1F479}";
      } else if (isTreasure) {
        content = "\u{1F48E}";
        if (treasureCollecting) className += " hw-cell--treasure-collecting";
      } else if (isBoulder) {
        content = "\u{1FAA8}";
        className += " hw-cell--boulder";
      }

      cells.push(
        <div key={`${r}-${c}`} className={className}>
          {content}
        </div>,
      );
    }
  }

  // Hero as absolutely positioned overlay
  let heroClass = "hw-hero";
  if (heroBlocked) heroClass += " hw-hero--blocked";
  if (winAnimation) heroClass += " hw-hero--win";

  return (
    <div className="hw-grid-wrapper">
      <div className="hw-grid">{cells}</div>
      <div
        className={heroClass}
        style={{
          "--hw-row": heroState.pos.row,
          "--hw-col": heroState.pos.col,
        } as React.CSSProperties}
      >
        <span
          className="hw-hero-sprite"
          style={{ transform: `rotate(${DIR_ROTATION[heroState.dir]})` }}
        >
          {"\u{1F9B8}"}
        </span>
      </div>
    </div>
  );
}
