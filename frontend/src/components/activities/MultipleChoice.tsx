import { useState } from "react";

interface Props {
  answerData: string;
  onSubmit: (answer: unknown) => void;
}

export default function MultipleChoice({ answerData, onSubmit }: Props) {
  const { options } = JSON.parse(answerData) as { options: string[] };
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="activity activity--mc">
      <div className="mc-options">
        {options.map((opt, i) => (
          <button
            key={i}
            className={`mc-option ${selected === i ? "mc-option--selected" : ""}`}
            onClick={() => setSelected(i)}
          >
            {opt}
          </button>
        ))}
      </div>
      <button
        className="btn btn-primary"
        disabled={selected === null}
        onClick={() => onSubmit({ selected, selected_text: options[selected!] })}
      >
        Odpovědět
      </button>
    </div>
  );
}
