import type { AnimalType, ToolMode } from "../types";

interface Props {
  eggs: number;
  toolMode: ToolMode;
  unitCosts: Record<AnimalType, number>;
  onSelectTool: (mode: ToolMode) => void;
}

const UNITS: { type: AnimalType; label: string; emoji: string }[] = [
  { type: "chicken", label: "Slepice", emoji: "🐔" },
  { type: "llama", label: "Lama", emoji: "🦙" },
  { type: "ram", label: "Beran", emoji: "🐏" },
];

export default function Toolbar({
  eggs,
  toolMode,
  unitCosts,
  onSelectTool,
}: Props) {
  function handleUnitClick(type: AnimalType) {
    if (toolMode.kind === "place" && toolMode.unitType === type) {
      onSelectTool({ kind: "idle" });
    } else {
      onSelectTool({ kind: "place", unitType: type });
    }
  }

  function handleSellClick() {
    if (toolMode.kind === "sell") {
      onSelectTool({ kind: "idle" });
    } else {
      onSelectTool({ kind: "sell" });
    }
  }

  return (
    <div className="fg-toolbar">
      <div className="fg-egg-counter">
        <span className="fg-egg-icon">🥚</span>
        <span className="fg-egg-count">{eggs}</span>
      </div>

      <div className="fg-tool-buttons">
        {UNITS.map((u) => {
          const isSelected =
            toolMode.kind === "place" && toolMode.unitType === u.type;
          const canAfford = eggs >= unitCosts[u.type];

          return (
            <button
              key={u.type}
              className={`fg-tool-btn${isSelected ? " fg-tool-btn--selected" : ""}${
                !canAfford ? " fg-tool-btn--disabled" : ""
              }`}
              onClick={() => handleUnitClick(u.type)}
              disabled={!canAfford && !isSelected}
            >
              <span className="fg-tool-emoji">{u.emoji}</span>
              <span className="fg-tool-label">{u.label}</span>
              <span className="fg-tool-cost">{unitCosts[u.type]}🥚</span>
            </button>
          );
        })}

        <button
          className={`fg-tool-btn fg-tool-btn--sell${
            toolMode.kind === "sell" ? " fg-tool-btn--selected" : ""
          }`}
          onClick={handleSellClick}
        >
          <span className="fg-tool-emoji">🗑️</span>
          <span className="fg-tool-label">Prodat</span>
        </button>
      </div>
    </div>
  );
}
