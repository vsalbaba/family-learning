import type { Command } from "./types";

interface Props {
  onCommand: (cmd: Command) => void;
  onGo: () => void;
  disabled: boolean;
  planLength: number;
  maxCommands: number;
}

export default function CommandButtons({
  onCommand,
  onGo,
  disabled,
  planLength,
  maxCommands,
}: Props) {
  const full = planLength >= maxCommands;

  return (
    <div className="hw-buttons">
      <button
        className="btn btn-secondary"
        onClick={() => onCommand("forward")}
        disabled={disabled || full}
      >
        {"\u2B06"} Vpřed
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => onCommand("attack")}
        disabled={disabled || full}
      >
        {"\u2694"} Útok
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => onCommand("turnLeft")}
        disabled={disabled || full}
      >
        {"\u21B0"} Vlevo
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => onCommand("turnRight")}
        disabled={disabled || full}
      >
        {"\u21B1"} Vpravo
      </button>
      <button
        className="btn btn-primary hw-go"
        onClick={onGo}
        disabled={disabled || planLength === 0}
      >
        {"\u25B6"} GO!
      </button>
    </div>
  );
}
