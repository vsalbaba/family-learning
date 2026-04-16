import type { GameState } from "../game-state";

export function updateEconomy(state: GameState, dt: number): void {
  // On-grid chickens
  for (const animal of state.animals.values()) {
    if (animal.type !== "chicken") continue;
    if (animal.state === "dying") continue;
    if (animal.eggReady) continue;

    animal.eggTimer -= dt;
    if (animal.eggTimer <= 0) {
      animal.eggReady = true;
      animal.state = "egg-ready";
      animal.eggTimer = 0;
    }
  }

  // Barn chicken
  if (!state.barnChicken.eggReady) {
    state.barnChicken.eggTimer -= dt;
    if (state.barnChicken.eggTimer <= 0) {
      state.barnChicken.eggReady = true;
      state.barnChicken.eggTimer = 0;
    }
  }
}
