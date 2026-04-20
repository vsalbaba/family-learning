import { forwardRef } from "react";
import type { ArenaConfig } from "../types";

interface Props {
  config: ArenaConfig;
}

const ArenaBoard = forwardRef<HTMLCanvasElement, Props>(
  function ArenaBoard({ config }, ref) {
    const aspectRatio = config.boardWidthPx / config.boardHeightPx;

    return (
      <canvas
        ref={ref}
        className="arena-board"
        style={{
          width: "100%",
          maxWidth: config.boardWidthPx,
          aspectRatio: `${aspectRatio}`,
          display: "block",
        }}
      />
    );
  },
);

export default ArenaBoard;
