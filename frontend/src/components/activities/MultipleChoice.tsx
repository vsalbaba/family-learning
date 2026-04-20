import { useState } from "react";
import SpeakButton from "../common/SpeakButton";

interface Props {
  /** JSON string: `{ options: string[], index_map?: number[] }`. Options to display; index_map maps display order back to original indices. */
  answerData: string;
  /** Called with `{ selected: number, selected_text: string }` when the child submits. */
  onSubmit: (answer: unknown) => void;
  /** BCP-47 language tag for text-to-speech, or null if TTS disabled. */
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
              aria-pressed={selected === i}
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
