import type { ArenaGameState } from "../game-state";
import type { Enemy, PlayerUnit } from "../types";
import { createSpellEffect } from "../entities";

/**
 * Combat system: targeting, damage, hit effects, death.
 * All attacks are instant hit — no projectiles.
 */
export function updateCombat(state: ArenaGameState, dt: number): void {
  tickHitTimers(state, dt);
  processPlayerAttacks(state, dt);
  processEnemyAttacks(state, dt);
}

// ── Hit timers ──────────────────────────────────────────────────────

function tickHitTimers(state: ArenaGameState, dt: number): void {
  for (const unit of state.playerUnits.values()) {
    if (unit.state === "hit") {
      unit.animTimer -= dt;
      if (unit.animTimer <= 0) {
        unit.state = unit.hp > 0 ? "walking" : "dying";
        unit.animTimer = unit.hp > 0 ? 0 : state.config.dyingDurationMs;
      }
    }
    // Tick attack cooldown
    if (unit.attackCooldown > 0) {
      unit.attackCooldown -= dt;
    }
  }

  for (const enemy of state.enemies.values()) {
    if (enemy.state === "hit") {
      enemy.animTimer -= dt;
      if (enemy.animTimer <= 0) {
        enemy.hitByArrow = false;
        enemy.state = enemy.hp > 0 ? "walking" : "dying";
        enemy.animTimer = enemy.hp > 0 ? 0 : state.config.dyingDurationMs;
      }
    }
    if (enemy.attackCooldown > 0) {
      enemy.attackCooldown -= dt;
    }
  }
}

// ── Player attacks ──────────────────────────────────────────────────

function processPlayerAttacks(state: ArenaGameState, dt: number): void {
  void dt;
  for (const unit of state.playerUnits.values()) {
    if (unit.state !== "attacking" || unit.attackCooldown > 0) continue;

    // Find nearest enemy in range
    const target = findNearestEnemyInRange(state, unit);
    if (!target) {
      // No target in range → resume walking
      unit.state = "walking";
      continue;
    }

    // Attack
    unit.attackCooldown = unit.attackCooldownMax;

    if (unit.splashRadius > 0) {
      // Wizard: splash damage to all enemies within radius
      applyWizardSplash(state, unit, target);
    } else if (unit.type === "lucistnik") {
      // Archer: instant hit with arrow overlay
      applyDamageToEnemy(state, target, unit.damage);
      target.hitByArrow = true;
    } else {
      // Melee: pěšák or obr
      applyDamageToEnemy(state, target, unit.damage);
    }
  }
}

function findNearestEnemyInRange(state: ArenaGameState, unit: PlayerUnit): Enemy | null {
  let nearest: Enemy | null = null;
  let nearestDist = Infinity;

  for (const enemy of state.enemies.values()) {
    if (enemy.state === "dying" || enemy.state === "spawning") continue;
    const dist = Math.abs(enemy.x - unit.x);
    if (dist <= unit.attackRange && dist < nearestDist) {
      nearestDist = dist;
      nearest = enemy;
    }
  }
  return nearest;
}

function applyWizardSplash(state: ArenaGameState, wizard: PlayerUnit, primaryTarget: Enemy): void {
  // Spawn spell effect at target position
  const perspective = state.config.perspective.slots[primaryTarget.perspectiveSlot];
  state.spellEffects.push(
    createSpellEffect(primaryTarget.x, primaryTarget.y + perspective.yOffset, state.config),
  );

  // Damage all enemies within splash radius of primary target
  for (const enemy of state.enemies.values()) {
    if (enemy.state === "dying" || enemy.state === "spawning") continue;
    const dist = Math.abs(enemy.x - primaryTarget.x);
    if (dist <= wizard.splashRadius) {
      applyDamageToEnemy(state, enemy, wizard.damage);
    }
  }
}

function applyDamageToEnemy(state: ArenaGameState, enemy: Enemy, damage: number): void {
  enemy.hp -= damage;
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.state = "dying";
    enemy.animTimer = state.config.dyingDurationMs;
    state.stats.enemiesKilled++;
  } else {
    enemy.state = "hit";
    enemy.animTimer = state.config.hitFlashMs;
  }
}

// ── Enemy attacks ───────────────────────────────────────────────────

function processEnemyAttacks(state: ArenaGameState, dt: number): void {
  void dt;
  for (const enemy of state.enemies.values()) {
    if (enemy.state !== "attacking" || enemy.attackCooldown > 0) continue;

    // Find nearest player unit in range (to the left)
    const target = findNearestPlayerInRange(state, enemy);
    if (!target) {
      enemy.state = "walking";
      continue;
    }

    // Attack
    enemy.attackCooldown = enemy.attackCooldownMax;
    applyDamageToPlayerUnit(state, target, enemy.damage);
  }
}

function findNearestPlayerInRange(state: ArenaGameState, enemy: Enemy): PlayerUnit | null {
  let nearest: PlayerUnit | null = null;
  let nearestDist = Infinity;

  for (const unit of state.playerUnits.values()) {
    if (unit.state === "dying") continue;
    const dist = Math.abs(enemy.x - unit.x);
    if (dist <= enemy.attackRange && dist < nearestDist) {
      nearestDist = dist;
      nearest = unit;
    }
  }
  return nearest;
}

function applyDamageToPlayerUnit(state: ArenaGameState, unit: PlayerUnit, damage: number): void {
  void state;
  unit.hp -= damage;
  if (unit.hp <= 0) {
    unit.hp = 0;
    unit.state = "dying";
    unit.animTimer = state.config.dyingDurationMs;
  } else {
    unit.state = "hit";
    unit.animTimer = state.config.hitFlashMs;
  }
}
