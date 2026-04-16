import type {
  Animal,
  AnimalType,
  BarnChicken,
  EntityId,
  GameConfig,
  GamePhase,
  GameSummary,
  Goblin,
  Projectile,
  ToolMode,
  ViewState,
} from "./types";
import {
  createAnimal,
  createBarnChicken,
  createGoblin,
  createProjectile,
  colLeftX,
  colRightX,
  resetIdCounter,
} from "./entities";

export class GameState {
  config: GameConfig;
  phase: GamePhase = "playing";

  animals = new Map<EntityId, Animal>();
  goblins = new Map<EntityId, Goblin>();
  projectiles = new Map<EntityId, Projectile>();

  /** grid[lane][col] → animal id or null */
  grid: (EntityId | null)[][];

  barnChicken: BarnChicken;

  eggs = 0;
  currentWave = 0;       // 0 = before first wave
  waveTimer = 0;         // ms elapsed since current wave started
  spawnQueue: Array<{ lane: number; delayMs: number; goblinType: string }> = [];
  pendingWaveDelay = 0;  // ms remaining before next wave starts
  wavesFinished = false;

  toolMode: ToolMode = { kind: "idle" };

  stats = {
    eggsCollected: 0,
    goblinsKilled: 0,
    animalsLost: 0,
  };

  constructor(config: GameConfig) {
    this.config = config;
    resetIdCounter();

    // Init grid
    this.grid = Array.from({ length: config.laneCount }, () =>
      Array<EntityId | null>(config.colCount).fill(null),
    );

    // Place starting chickens in column 0 with egg already laid
    for (let lane = 0; lane < config.laneCount; lane++) {
      const chicken = createAnimal("chicken", lane, 0, config);
      chicken.eggReady = true;
      chicken.eggTimer = 0;
      chicken.state = "egg-ready";
      this.animals.set(chicken.id, chicken);
      this.grid[lane][0] = chicken.id;
    }

    // Barn chicken
    this.barnChicken = createBarnChicken(config);

    // Start first wave delay
    if (config.waves.length > 0) {
      this.pendingWaveDelay = config.waves[0].delayBeforeMs;
    }
  }

  // ── Animal management ───────────────────────────────────────────

  addAnimal(type: AnimalType, lane: number, col: number): Animal | null {
    if (lane < 0 || lane >= this.config.laneCount) return null;
    if (col < 0 || col >= this.config.colCount) return null;
    if (this.grid[lane][col] !== null) return null;
    if (this.eggs < this.config.unitCosts[type]) return null;

    this.eggs -= this.config.unitCosts[type];
    const animal = createAnimal(type, lane, col, this.config);
    this.animals.set(animal.id, animal);
    this.grid[lane][col] = animal.id;

    // Placement push: move goblins in this slot's lane segment
    this._pushGoblinsFromSlot(lane, col, animal);

    return animal;
  }

  removeAnimal(id: EntityId): void {
    const animal = this.animals.get(id);
    if (!animal) return;
    this.grid[animal.lane][animal.col] = null;
    this.animals.delete(id);
    this.stats.animalsLost++;
  }

  // ── Goblin management ───────────────────────────────────────────

  spawnGoblin(lane: number, goblinType: string): Goblin {
    const goblin = createGoblin(lane, goblinType, this.config);
    this.goblins.set(goblin.id, goblin);
    return goblin;
  }

  removeGoblin(id: EntityId): void {
    this.goblins.delete(id);
  }

  // ── Projectile management ───────────────────────────────────────

  addProjectile(
    lane: number,
    x: number,
    y: number,
    dx: number,
    damage: number,
    sourceId: EntityId,
  ): Projectile {
    const proj = createProjectile(
      lane, x, y, dx, damage, sourceId, this.config,
    );
    this.projectiles.set(proj.id, proj);
    return proj;
  }

  removeProjectile(id: EntityId): void {
    this.projectiles.delete(id);
  }

  // ── Economy ─────────────────────────────────────────────────────

  collectEgg(animalId: EntityId): boolean {
    const animal = this.animals.get(animalId);
    if (!animal || animal.type !== "chicken" || !animal.eggReady) return false;
    animal.eggReady = false;
    animal.eggTimer = this.config.eggLayIntervalMs;
    animal.state = "idle";
    this.eggs++;
    this.stats.eggsCollected++;
    return true;
  }

  collectBarnEgg(): boolean {
    if (!this.barnChicken.eggReady) return false;
    this.barnChicken.eggReady = false;
    this.barnChicken.eggTimer = this.config.barnChickenEggIntervalMs;
    this.eggs++;
    this.stats.eggsCollected++;
    return true;
  }

  // ── Sell ─────────────────────────────────────────────────────────

  sellAnimal(id: EntityId): boolean {
    const animal = this.animals.get(id);
    if (!animal) return false;
    this.grid[animal.lane][animal.col] = null;
    this.animals.delete(id);
    this.eggs++;
    return true;
  }

  // ── Placement push ──────────────────────────────────────────────

  private _pushGoblinsFromSlot(
    lane: number,
    col: number,
    newAnimal: Animal,
  ): void {
    const leftBound = colLeftX(col, this.config);
    const rightBound = colRightX(col, this.config);

    for (const goblin of this.goblins.values()) {
      if (goblin.lane !== lane) continue;
      if (goblin.state === "dying") continue;
      if (goblin.x < leftBound || goblin.x > rightBound) continue;

      // Push to right interaction boundary
      goblin.x = rightBound;
      goblin.knockbackVelocity = 0;

      // Retarget: if the new animal is the first animal ahead
      const firstAnimalAhead = this._firstAnimalAhead(goblin);
      if (firstAnimalAhead && firstAnimalAhead.id === newAnimal.id) {
        goblin.targetId = newAnimal.id;
      } else {
        goblin.targetId = null; // will be re-evaluated by combat system
      }
    }
  }

  /** Find the nearest animal ahead of (to the left of) a goblin in its lane. */
  _firstAnimalAhead(goblin: Goblin): Animal | null {
    let nearest: Animal | null = null;
    let nearestX = -Infinity;

    for (const animal of this.animals.values()) {
      if (animal.lane !== goblin.lane) continue;
      if (animal.state === "dying") continue;
      if (animal.x >= goblin.x) continue; // not ahead (goblin moves left)
      if (animal.x > nearestX) {
        nearestX = animal.x;
        nearest = animal;
      }
    }
    return nearest;
  }

  // ── View state bridge ───────────────────────────────────────────

  extractView(): ViewState {
    return {
      eggs: this.eggs,
      currentWave: this.currentWave,
      totalWaves: this.config.waves.length,
      phase: this.phase,
      toolMode: this.toolMode,
      summary: this.phase !== "playing" ? this._buildSummary() : null,
    };
  }

  private _buildSummary(): GameSummary {
    return {
      result: this.phase === "won" ? "won" : "lost",
      eggsCollected: this.stats.eggsCollected,
      goblinsKilled: this.stats.goblinsKilled,
      animalsLost: this.stats.animalsLost,
      wavesCompleted: this.currentWave,
      totalWaves: this.config.waves.length,
    };
  }
}
