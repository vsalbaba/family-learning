import { useEffect, useRef, useState, useCallback } from "react";
import type { GameConfig, ToolMode, ViewState } from "../types";
import { GameState } from "../game-state";
import { createGameLoop } from "../game-loop";
import { createInputHandler } from "../input-handler";

const INITIAL_VIEW: ViewState = {
  eggs: 0,
  currentWave: 0,
  totalWaves: 0,
  phase: "playing",
  toolMode: { kind: "idle" },
  summary: null,
};

export function useGameLoop(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  config: GameConfig,
) {
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const stateRef = useRef<GameState | null>(null);
  const toolModeRef = useRef<ToolMode>({ kind: "idle" });
  const loopRef = useRef<{ stop(): void } | null>(null);
  const inputRef = useRef<ReturnType<typeof createInputHandler> | null>(null);

  const setToolMode = useCallback((mode: ToolMode) => {
    toolModeRef.current = mode;
    if (stateRef.current) {
      stateRef.current.toolMode = mode;
    }
    setView((prev) => ({ ...prev, toolMode: mode }));
  }, []);

  // Init & start
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas resolution
    const totalWidth = config.barnWidthPx + config.boardWidthPx;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = config.boardHeightPx * dpr;
    ctx.scale(dpr, dpr);

    // Create game state
    const state = new GameState(config);
    stateRef.current = state;

    // Create game loop
    const loop = createGameLoop(state, ctx, setView);
    loopRef.current = loop;

    // Create input handler
    const input = createInputHandler(stateRef, toolModeRef, setToolMode);
    input.attach(canvas);
    inputRef.current = input;

    loop.start();

    return () => {
      loop.stop();
      input.detach();
      loopRef.current = null;
      inputRef.current = null;
      stateRef.current = null;
    };
  }, [canvasRef, config, setToolMode]);

  const restart = useCallback(() => {
    // Stop current
    loopRef.current?.stop();
    inputRef.current?.detach();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset scale
    const totalWidth = config.barnWidthPx + config.boardWidthPx;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = config.boardHeightPx * dpr;
    ctx.scale(dpr, dpr);

    // New state
    const state = new GameState(config);
    stateRef.current = state;
    toolModeRef.current = { kind: "idle" };

    const loop = createGameLoop(state, ctx, setView);
    loopRef.current = loop;

    const input = createInputHandler(stateRef, toolModeRef, setToolMode);
    input.attach(canvas);
    inputRef.current = input;

    loop.start();
  }, [canvasRef, config, setToolMode]);

  return { view, setToolMode, restart };
}
