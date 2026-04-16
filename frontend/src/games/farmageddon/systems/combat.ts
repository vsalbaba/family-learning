import type { GameState } from "../game-state";
import type { Animal, Goblin } from "../types";

export function updateCombat(state: GameState, dt: number): void {
  updateProjectiles(state, dt);
  updateLlamaAttacks(state, dt);
  updateRamAttacks(state, dt);
  updateGoblinAttacks(state, dt);
  updateAnimalHitTimers(state, dt);
}

// ── Projectile movement & hit detection ─────────────────────────────

function updateProjectiles(state: GameState, dt: number): void {
  const dtSec = dt / 1000;
  const toRemove: number[] = [];

  for (const proj of state.projectiles.values()) {
    // Hit state: tick timer then remove when done
    if (proj.state === "hit") {
      proj.animTimer += dt;
      if (proj.animTimer >= state.config.projectileHitMs) {
        toRemove.push(proj.id);
      }
      continue;
    }

    // Flying state
    proj.x += proj.dx * proj.speed * dtSec;

    // Out of bounds
    if (proj.x < 0 || proj.x > state.config.boardWidthPx) {
      toRemove.push(proj.id);
      continue;
    }

    // Hit detection: nearest goblin in lane in projectile direction
    let hitGoblin: Goblin | null = null;
    let hitDist = Infinity;

    for (const goblin of state.goblins.values()) {
      if (goblin.lane !== proj.lane) continue;
      if (goblin.state === "spawning" || goblin.state === "dying") continue;

      const dist = Math.abs(goblin.x - proj.x);
      if (dist < 15 && dist < hitDist) {
        hitDist = dist;
        hitGoblin = goblin;
      }
    }

    if (hitGoblin) {
      applyDamageToGoblin(state, hitGoblin, proj.damage);
      proj.state = "hit";
      proj.animTimer = 0;
      proj.speed = 0;
    }
  }

  for (const id of toRemove) {
    state.removeProjectile(id);
  }
}

// ── Llama targeting ─────────────────────────────────────────────────

function updateLlamaAttacks(state: GameState, dt: number): void {
  for (const animal of state.animals.values()) {
    if (animal.type !== "llama") continue;
    if (animal.state === "dying" || animal.state === "hit") continue;

    // Tick cooldown
    if (animal.attackCooldown > 0) {
      animal.attackCooldown -= dt;
      if (animal.attackCooldown > 0) {
        if (animal.state !== "cooldown") animal.state = "cooldown";
        continue;
      }
      animal.state = "idle";
    }

    // Find nearest goblin in facing direction
    const target = findNearestGoblinInDirection(state, animal);
    if (!target) {
      if (animal.state !== "idle") animal.state = "idle";
      continue;
    }

    // Fire projectile
    const dx = animal.facing === "right" ? 1 : -1;
    state.addProjectile(
      animal.lane,
      animal.x,
      animal.y,
      dx,
      state.config.unitStats.llama.damage,
      animal.id,
    );
    animal.state = "attacking";
    animal.attackCooldown = state.config.unitStats.llama.attackCooldownMs;
    animal.animTimer = 100; // brief attack anim
  }
}

function findNearestGoblinInDirection(
  state: GameState,
  llama: Animal,
): Goblin | null {
  let nearest: Goblin | null = null;
  let nearestDist = Infinity;

  for (const goblin of state.goblins.values()) {
    if (goblin.lane !== llama.lane) continue;
    if (goblin.state === "spawning" || goblin.state === "dying") continue;

    const diff = goblin.x - llama.x;
    const inDirection =
      (llama.facing === "right" && diff > 0) ||
      (llama.facing === "left" && diff < 0);

    if (inDirection) {
      const dist = Math.abs(diff);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = goblin;
      }
    }
  }
  return nearest;
}

// ── Ram targeting ───────────────────────────────────────────────────

function updateRamAttacks(state: GameState, dt: number): void {
  const ramRange =
    state.config.unitStats.ram.attackRangeCols *
    (state.config.boardWidthPx / state.config.colCount);

  for (const animal of state.animals.values()) {
    if (animal.type !== "ram") continue;
    if (animal.state === "dying" || animal.state === "hit") continue;

    // Tick cooldown
    if (animal.attackCooldown > 0) {
      animal.attackCooldown -= dt;
      if (animal.attackCooldown > 0) {
        if (animal.state !== "cooldown") animal.state = "cooldown";
        continue;
      }
      animal.state = "idle";
    }

    // Find nearest goblin in front (to the right) within melee range
    let target: Goblin | null = null;
    let targetDist = Infinity;

    for (const goblin of state.goblins.values()) {
      if (goblin.lane !== animal.lane) continue;
      if (goblin.state === "spawning" || goblin.state === "dying") continue;

      const diff = goblin.x - animal.x;
      if (diff > 0 && diff <= ramRange && diff < targetDist) {
        targetDist = diff;
        target = goblin;
      }
    }

    if (!target) {
      if (animal.state !== "idle") animal.state = "idle";
      continue;
    }

    // Attack: deal damage and knockback
    applyDamageToGoblin(state, target, state.config.unitStats.ram.damage);
    target.knockbackVelocity = state.config.unitStats.ram.knockbackPx;
    if (target.state !== "dying") {
      target.state = "knockback";
      target.targetId = null;
    }

    animal.state = "attacking";
    animal.attackCooldown = state.config.unitStats.ram.attackCooldownMs;
    animal.animTimer = 100;
  }
}

// ── Goblin attacks ──────────────────────────────────────────────────

function updateGoblinAttacks(state: GameState, dt: number): void {
  for (const goblin of state.goblins.values()) {
    if (goblin.state === "spawning" || goblin.state === "dying") continue;
    if (goblin.state === "knockback") continue;

    // Tick attack cooldown
    if (goblin.attackCooldown > 0) {
      goblin.attackCooldown -= dt;
    }

    // Find nearest animal ahead (to the left)
    const target = state._firstAnimalAhead(goblin);

    if (!target || target.state === "dying") {
      // No target: resume walking
      if (goblin.state === "attacking") {
        goblin.state = "walking";
        goblin.targetId = null;
      }
      continue;
    }

    const dist = goblin.x - target.x;

    if (dist <= goblin.attackRange + 20) {
      // In range: attack
      goblin.state = "attacking";
      goblin.targetId = target.id;

      if (goblin.attackCooldown <= 0) {
        applyDamageToAnimal(state, target, goblin.damage);
        goblin.attackCooldown = goblin.attackCooldownMax;
      }
    } else if (goblin.state === "attacking") {
      // Target moved out of range (knockback?), resume walking
      goblin.state = "walking";
      goblin.targetId = null;
    }
  }
}

// ── Hit timers ──────────────────────────────────────────────────────

function updateAnimalHitTimers(state: GameState, dt: number): void {
  for (const animal of state.animals.values()) {
    if (animal.state === "hit") {
      animal.animTimer -= dt;
      if (animal.animTimer <= 0) {
        // Return to appropriate state
        if (animal.type === "chicken" && animal.eggReady) {
          animal.state = "egg-ready";
        } else {
          animal.state = "idle";
        }
      }
    }
    if (animal.state === "attacking") {
      animal.animTimer -= dt;
      if (animal.animTimer <= 0) {
        animal.state = animal.attackCooldown > 0 ? "cooldown" : "idle";
      }
    }
  }
}

// ── Damage helpers ──────────────────────────────────────────────────

function applyDamageToGoblin(
  state: GameState,
  goblin: Goblin,
  damage: number,
): void {
  goblin.hp -= damage;
  if (goblin.hp <= 0) {
    goblin.state = "dying";
    goblin.animTimer = state.config.dyingDurationMs;
    goblin.knockbackVelocity = 0;
    state.stats.goblinsKilled++;
  }
}

function applyDamageToAnimal(
  state: GameState,
  animal: Animal,
  damage: number,
): void {
  animal.hp -= damage;
  if (animal.hp <= 0) {
    animal.state = "dying";
    animal.animTimer = state.config.dyingDurationMs;
  } else {
    animal.state = "hit";
    animal.animTimer = state.config.hitFlashMs;
  }
}
