export type Direction = "N" | "E" | "S" | "W";
export type Terrain = "empty" | "boulder";
export type Command = "forward" | "turnLeft" | "turnRight" | "attack";

export interface Position {
  row: number;
  col: number;
}

export interface Enemy {
  id: number;
  pos: Position;
  alive: boolean;
}

export interface GameMap {
  width: 6;
  height: 6;
  terrain: Terrain[][];
  heroStart: Position;
  heroDir: Direction;
  princessPos: Position;
  treasurePos: Position | null;
  enemies: Enemy[];
}

export interface HeroState {
  pos: Position;
  dir: Direction;
  treasureCollected: boolean;
}

export interface StepResult {
  command: Command;
  hero: HeroState;
  enemyKilled: Position | null;
  treasurePickedUp: boolean;
  blocked: boolean;
}

export interface SimulationResult {
  outcome: "win" | "lose";
  steps: StepResult[];
  treasureCollected: boolean;
}

export interface Trace {
  startPos: Position;
  startDir: Direction;
  steps: TraceStep[];
}

export interface TraceStep {
  command: Command;
  beforePos: Position;
  beforeDir: Direction;
  afterPos: Position;
  afterDir: Direction;
  attackTarget: Position | null;
}
