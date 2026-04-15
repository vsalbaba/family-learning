import { useState } from "react";
import SpeakButton from "../common/SpeakButton";

interface Props {
  answerData: string;
  onSubmit: (answer: unknown) => void;
  ttsLang?: string | null;
}

export default function MultipleChoice({ answerData, onSubmit, ttsLang }: Props) {
  const parsed = JSON.parse(answerData) as { options: string[]; index_map?: number[] };
  const { options, index_map } = parsed;
  const [selected, setSelected] = useState<number | null>(null);

  function handleSubmit() {
    if (selected === null) return;
    // index_map maps shuffled position → original index
    const originalIndex = index_map ? index_map[selected] : selected;
    onSubmit({ selected: originalIndex, selected_text: options[selected] });
  }

  return (
    <div className="activity activity--mc">
      <div className="mc-options">
        {options.map((opt, i) => (
          <div key={i} className="mc-option-row">
            <button
              className={`mc-option ${selected === i ? "mc-option--selected" : ""}`}
              onClick={() => setSelected(i)}
            >
              {opt}
            </button>
            {ttsLang && <SpeakButton text={opt} lang={ttsLang} />}
          </div>
        ))}
      </div>
      <button
        className="btn btn-primary"
        disabled={selected === null}
        onClick={handleSubmit}
      >
        Odpovědět
      </button>
    </div>
  );
}
