import { useEffect, useRef, useState, useCallback } from "react";
import type { ArenaConfig, ArenaViewState, Tier } from "../types";
import { ArenaGameState } from "../game-state";
import { createArenaGameLoop } from "../game-loop";
import { createArenaSpriteManager, ARENA_SPRITE_PATHS } from "../sprite-manager";
import type { ArenaSpriteManager } from "../sprite-manager";

const INITIAL_VIEW: ArenaViewState = {
  remainingSeconds: 0,
  phase: "playing",
  stats: {
    easyAnswered: 0,
    easyCorrect: 0,
    hardAnswered: 0,
    hardCorrect: 0,
    unitsSpawned: 0,
    enemiesKilled: 0,
  },
  summary: null,
};

export function useArenaGame(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  config: ArenaConfig,
) {
  const [view, setView] = useState<ArenaViewState>(INITIAL_VIEW);
  const stateRef = useRef<ArenaGameState | null>(null);
  const loopRef = useRef<{ stop(): void } | null>(null);
  const spritesRef = useRef<ArenaSpriteManager | null>(null);

  // Load sprites once
  useEffect(() => {
    const sprites = createArenaSpriteManager();
    spritesRef.current = sprites;
    sprites.load(ARENA_SPRITE_PATHS);
  }, []);

  // Init & start
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = config.boardWidthPx * dpr;
    canvas.height = config.boardHeightPx * dpr;
    ctx.scale(dpr, dpr);

    const state = new ArenaGameState(config);
    stateRef.current = state;

    const sprites = spritesRef.current ?? createArenaSpriteManager();
    const loop = createArenaGameLoop(state, ctx, sprites, setView);
    loopRef.current = loop;

    loop.start();

    return () => {
      loop.stop();
      loopRef.current = null;
      stateRef.current = null;
    };
  }, [canvasRef, config]);

  const handleAnswer = useCallback((tier: Tier, correct: boolean) => {
    const state = stateRef.current;
    if (!state || state.phase !== "playing") return;

    state.recordAnswer(tier, correct);
    if (correct) {
      state.spawnUnit(tier);
    }
  }, []);

  const restart = useCallback(() => {
    loopRef.current?.stop();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = config.boardWidthPx * dpr;
    canvas.height = config.boardHeightPx * dpr;
    ctx.scale(dpr, dpr);

    const state = new ArenaGameState(config);
    stateRef.current = state;

    const sprites = spritesRef.current ?? createArenaSpriteManager();
    const loop = createArenaGameLoop(state, ctx, sprites, setView);
    loopRef.current = loop;

    loop.start();
  }, [canvasRef, config]);

  return { view, handleAnswer, restart };
}
