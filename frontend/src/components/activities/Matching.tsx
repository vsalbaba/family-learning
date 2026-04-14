import { useState } from "react";

interface Props {
  answerData: string;
  onSubmit: (answer: unknown) => void;
}

export default function Matching({ answerData, onSubmit }: Props) {
  const { lefts, rights } = JSON.parse(answerData) as {
    lefts: string[];
    rights: string[];
  };
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const usedRights = new Set(Object.values(pairs));

  function handleRightClick(right: string) {
    if (!selectedLeft) return;
    setPairs((p) => ({ ...p, [selectedLeft]: right }));
    setSelectedLeft(null);
  }

  function handleSubmit() {
    const result = lefts.map((left) => ({
      left,
      right: pairs[left] || "",
    }));
    onSubmit({ pairs: result });
  }

  const allPaired = lefts.every((l) => pairs[l]);

  return (
    <div className="activity activity--matching">
      <div className="matching-columns">
        <div className="matching-col">
          {lefts.map((left) => (
            <button
              key={left}
              className={`matching-item ${selectedLeft === left ? "matching-item--selected" : ""} ${pairs[left] ? "matching-item--paired" : ""}`}
              onClick={() => setSelectedLeft(left)}
            >
              {left}
              {pairs[left] && <span className="matching-pair"> → {pairs[left]}</span>}
            </button>
          ))}
        </div>
        <div className="matching-col">
          {rights.map((right) => (
            <button
              key={right}
              className={`matching-item ${usedRights.has(right) ? "matching-item--used" : ""}`}
              onClick={() => handleRightClick(right)}
              disabled={usedRights.has(right) || !selectedLeft}
            >
              {right}
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary" disabled={!allPaired} onClick={handleSubmit}>
        Odpovědět
      </button>
    </div>
  );
}
