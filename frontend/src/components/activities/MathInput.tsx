import { useState } from "react";

interface Props {
  /** JSON string: `{ unit?: string }`. Optional unit label displayed next to the input. */
  answerData: string;
  /** Called with `{ value: string }` — the child's numeric answer as a string. */
  onSubmit: (answer: unknown) => void;
}

export default function MathInput({ answerData, onSubmit }: Props) {
  const parsed = JSON.parse(answerData) as { unit?: string };
  const [value, setValue] = useState("");

  return (
    <div className="activity activity--math">
      <div className="math-input-row">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Zadej číslo"
          className="math-input"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim())
              onSubmit({ value: parseFloat(value) });
          }}
        />
        {parsed.unit && <span className="math-unit">{parsed.unit}</span>}
      </div>
      <button
        className="btn btn-primary"
        disabled={!value.trim()}
        onClick={() => onSubmit({ value: parseFloat(value) })}
      >
        Odpovědět
      </button>
    </div>
  );
}
