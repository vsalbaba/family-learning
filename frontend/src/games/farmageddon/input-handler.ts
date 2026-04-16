import type { GameState } from "./game-state";
import type { ToolMode } from "./types";
import { placeUnit, sellUnit } from "./systems/placement";

export interface InputHandler {
  attach(canvas: HTMLCanvasElement): void;
  detach(): void;
}

export function createInputHandler(
  stateRef: { current: GameState | null },
  toolModeRef: { current: ToolMode },
  onToolModeChange: (mode: ToolMode) => void,
): InputHandler {
  let canvas: HTMLCanvasElement | null = null;

  function handlePointer(e: PointerEvent) {
    const state = stateRef.current;
    if (!state || state.phase !== "playing") return;

    const rect = canvas!.getBoundingClientRect();
    const { config } = state;

    // Map CSS pixels → logical game coordinates (including barn area)
    const totalWidth = config.barnWidthPx + config.boardWidthPx;
    const scaleX = totalWidth / rect.width;
    const scaleY = config.boardHeightPx / rect.height;

    const gameX = (e.clientX - rect.left) * scaleX;
    const gameY = (e.clientY - rect.top) * scaleY;

    // Check barn area tap
    if (gameX < config.barnWidthPx) {
      handleBarnTap(state);
      return;
    }

    // Convert to board coordinates (subtract barn offset)
    const boardX = gameX - config.barnWidthPx;
    const boardY = gameY;

    const colWidth = config.boardWidthPx / config.colCount;
    const laneHeight = config.boardHeightPx / config.laneCount;

    const col = Math.floor(boardX / colWidth);
    const lane = Math.floor(boardY / laneHeight);

    if (col < 0 || col >= config.colCount) return;
    if (lane < 0 || lane >= config.laneCount) return;

    const mode = toolModeRef.current;

    if (mode.kind === "place") {
      if (placeUnit(state, mode.unitType, lane, col)) {
        onToolModeChange({ kind: "idle" });
      }
      return;
    }

    if (mode.kind === "sell") {
      const entityId = state.grid[lane][col];
      if (entityId !== null) {
        sellUnit(state, entityId);
      }
      return;
    }

    // Idle mode
    const entityId = state.grid[lane][col];
    if (entityId === null) return;

    const animal = state.animals.get(entityId);
    if (!animal) return;

    if (animal.type === "chicken" && animal.eggReady) {
      state.collectEgg(entityId);
    } else if (animal.type === "llama") {
      animal.facing = animal.facing === "right" ? "left" : "right";
    }
  }

  function handleBarnTap(state: GameState) {
    if (state.barnChicken.eggReady) {
      state.collectBarnEgg();
    }
  }

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    handlePointer(e);
  }

  return {
    attach(c: HTMLCanvasElement) {
      canvas = c;
      canvas.addEventListener("pointerdown", onPointerDown);
    },
    detach() {
      canvas?.removeEventListener("pointerdown", onPointerDown);
      canvas = null;
    },
  };
}
