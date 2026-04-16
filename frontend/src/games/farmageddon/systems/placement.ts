import type { GameState } from "../game-state";
import type { AnimalType, EntityId } from "../types";

/**
 * Attempt to place a unit. Returns true on success.
 * Handles cost deduction and placement push via GameState.addAnimal.
 */
export function placeUnit(
  state: GameState,
  unitType: AnimalType,
  lane: number,
  col: number,
): boolean {
  const animal = state.addAnimal(unitType, lane, col);
  return animal !== null;
}

/**
 * Sell (remove) a placed animal. Returns true on success.
 */
export function sellUnit(state: GameState, entityId: EntityId): boolean {
  return state.sellAnimal(entityId);
}
