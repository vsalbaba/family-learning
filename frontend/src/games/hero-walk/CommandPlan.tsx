import type { Command } from "./types";

interface Props {
  plan: Command[];
  currentStepIndex: number;
  running: boolean;
  onRemove: (index: number) => void;
}

const CMD_ICON: Record<Command, string> = {
  forward: "\u2B06",    // ⬆
  turnLeft: "\u21B0",   // ↰
  turnRight: "\u21B1",  // ↱
  attack: "\u2694",     // ⚔
};

export default function CommandPlan({
  plan,
  currentStepIndex,
  running,
  onRemove,
}: Props) {
  return (
    <div className="hw-plan">
      {plan.length === 0 && (
        <span className="hw-plan-empty">Klikni na příkaz...</span>
      )}
      {plan.map((cmd, i) => {
        let className = "hw-plan-item";
        if (running && i === currentStepIndex) className += " hw-plan-item--active";
        if (running && i < currentStepIndex) className += " hw-plan-item--done";

        return (
          <button
            key={i}
            className={className}
            onClick={() => !running && onRemove(i)}
            disabled={running}
            title={cmd}
          >
            {CMD_ICON[cmd]}
          </button>
        );
      })}
    </div>
  );
}
