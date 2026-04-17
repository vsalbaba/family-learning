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
  // Track pairs as left → right index to handle duplicate right-side values
  const [pairs, setPairs] = useState<Record<string, number>>({});
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const usedRightIndices = new Set(Object.values(pairs));

  function handleRightClick(index: number) {
    if (!selectedLeft) return;
    setPairs((p) => ({ ...p, [selectedLeft]: index }));
    setSelectedLeft(null);
  }

  function handleSubmit() {
    const result = lefts.map((left) => ({
      left,
      right: pairs[left] !== undefined ? rights[pairs[left]] : "",
    }));
    onSubmit({ pairs: result });
  }

  const allPaired = lefts.every((l) => pairs[l] !== undefined);

  return (
    <div className="activity activity--matching">
      <div className="matching-columns">
        <div className="matching-col">
          {lefts.map((left) => (
            <button
              key={left}
              className={`matching-item ${selectedLeft === left ? "matching-item--selected" : ""} ${pairs[left] !== undefined ? "matching-item--paired" : ""}`}
              onClick={() => {
                if (pairs[left] !== undefined) {
                  // Unpair: free the right-side answer
                  setPairs((p) => {
                    const next = { ...p };
                    delete next[left];
                    return next;
                  });
                  setSelectedLeft(null);
                } else {
                  setSelectedLeft(selectedLeft === left ? null : left);
                }
              }}
            >
              {left}
              {pairs[left] !== undefined && <span className="matching-pair"> → {rights[pairs[left]]}</span>}
            </button>
          ))}
        </div>
        <div className="matching-arrows" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3l4 4-4 4" />
            <path d="M20 7H4" />
            <path d="M8 21l-4-4 4-4" />
            <path d="M4 17h16" />
          </svg>
        </div>
        <div className="matching-col">
          {rights.map((right, i) => (
            <button
              key={i}
              className={`matching-item ${usedRightIndices.has(i) ? "matching-item--used" : ""}`}
              onClick={() => handleRightClick(i)}
              disabled={usedRightIndices.has(i) || !selectedLeft}
            >
              {right}
            </button>
          ))}
        </div>
      </div>
      <div className="matching-actions">
        <button className="btn btn-primary" disabled={!allPaired} onClick={handleSubmit}>
          Odpovědět
        </button>
        {Object.keys(pairs).length > 0 && (
          <button className="btn btn-secondary" onClick={() => { setPairs({}); setSelectedLeft(null); }}>
            Zrušit vše
          </button>
        )}
      </div>
    </div>
  );
}
