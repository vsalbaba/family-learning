import type {
  ArenaConfig,
  ArenaViewState,
  ArenaSummary,
  Enemy,
  EntityId,
  GamePhase,
  GameStats,
  PlayerUnit,
  PlayerUnitType,
  SpellEffect,
  Tier,
} from "./types";
import {
  createPlayerUnit,
  createEnemy,
  resetIdCounter,
  resetPerspective,
} from "./entities";

export class ArenaGameState {
  config: ArenaConfig;
  phase: GamePhase = "playing";

  playerUnits = new Map<EntityId, PlayerUnit>();
  enemies = new Map<EntityId, Enemy>();
  spellEffects: SpellEffect[] = [];

  remainingMs: number;
  enemySpawnTimer: number;
  enemySpawnInterval: number;
  enemiesSpawned = 0;

  stats: GameStats = {
    easyAnswered: 0,
    easyCorrect: 0,
    hardAnswered: 0,
    hardCorrect: 0,
    unitsSpawned: 0,
    enemiesKilled: 0,
  };

  constructor(config: ArenaConfig) {
    this.config = config;
    resetIdCounter();
    resetPerspective();

    this.remainingMs = config.gameDurationMs;
    this.enemySpawnInterval = config.spawnPhases[0].intervalMs;
    this.enemySpawnTimer = this.enemySpawnInterval;
  }

  // ── Spawn player unit ───────────────────────────────────────────

  spawnUnit(tier: Tier): PlayerUnit {
    const type = pickUnitType(tier);
    const unit = createPlayerUnit(type, this.config);
    this.playerUnits.set(unit.id, unit);
    this.stats.unitsSpawned++;
    return unit;
  }

  // ── Spawn enemy ─────────────────────────────────────────────────

  spawnEnemy(): Enemy {
    const enemy = createEnemy(this.config);
    this.enemies.set(enemy.id, enemy);
    this.enemiesSpawned++;
    return enemy;
  }

  // ── Remove entities ─────────────────────────────────────────────

  removePlayerUnit(id: EntityId): void {
    this.playerUnits.delete(id);
  }

  removeEnemy(id: EntityId): void {
    this.enemies.delete(id);
  }

  // ── Record answer ───────────────────────────────────────────────

  recordAnswer(tier: Tier, correct: boolean): void {
    if (tier === "easy") {
      this.stats.easyAnswered++;
      if (correct) this.stats.easyCorrect++;
    } else {
      this.stats.hardAnswered++;
      if (correct) this.stats.hardCorrect++;
    }
  }

  // ── View state bridge ───────────────────────────────────────────

  extractView(): ArenaViewState {
    return {
      remainingSeconds: Math.max(0, Math.ceil(this.remainingMs / 1000)),
      phase: this.phase,
      stats: { ...this.stats },
      summary: this.phase !== "playing" ? this._buildSummary() : null,
    };
  }

  private _buildSummary(): ArenaSummary {
    return {
      result: this.phase === "won" ? "won" : "lost",
      stats: { ...this.stats },
      durationMs: this.config.gameDurationMs - this.remainingMs,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function pickUnitType(tier: Tier): PlayerUnitType {
  if (tier === "easy") {
    return Math.random() < 0.5 ? "pesak" : "lucistnik";
  }
  return Math.random() < 0.5 ? "carodej" : "obr";
}
