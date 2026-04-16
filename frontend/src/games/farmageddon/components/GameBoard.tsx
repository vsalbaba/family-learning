import { forwardRef } from "react";
import type { GameConfig } from "../types";

interface Props {
  config: GameConfig;
}

const GameBoard = forwardRef<HTMLCanvasElement, Props>(
  function GameBoard({ config }, ref) {
    const totalWidth = config.barnWidthPx + config.boardWidthPx;
    const aspectRatio = totalWidth / config.boardHeightPx;

    return (
      <div
        className="fg-board-wrapper"
        style={{ aspectRatio: `${aspectRatio} / 1` }}
      >
        <canvas
          ref={ref}
          className="fg-board-canvas"
        />
      </div>
    );
  },
);

export default GameBoard;
