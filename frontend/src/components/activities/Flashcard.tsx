import { useState } from "react";
import SpeakButton from "../common/SpeakButton";

interface Props {
  /** JSON string: `{ answer: string }`. The answer text revealed on card flip. */
  answerData: string;
  /** Called with `{ self_score: "ok" }` after the child reveals and acknowledges the answer. */
  onSubmit: (answer: unknown) => void;
  /** BCP-47 language tag for text-to-speech, or null if TTS disabled. */
  ttsLang: string | null;
}

export default function Flashcard({ answerData, onSubmit, ttsLang }: Props) {
  const [revealed, setRevealed] = useState(false);

  if (!revealed) {
    return (
      <div className="activity activity--flashcard">
        <button className="btn btn-primary btn-large" onClick={() => setRevealed(true)}>
          Ukázat správnou odpověď
        </button>
      </div>
    );
  }

  const parsed = JSON.parse(answerData || "{}");

  return (
    <div className="activity activity--flashcard">
      <div className="flashcard-answer-row">
        <p className="flashcard-answer">{parsed.answer}</p>
        {ttsLang && <SpeakButton text={parsed.answer} lang={ttsLang} />}
      </div>
      <p className="flashcard-prompt">Věděl/a jsi?</p>
      <div className="flashcard-buttons">
        <button className="btn btn-large btn-true" onClick={() => onSubmit({ knew: true })}>
          Ano
        </button>
        <button className="btn btn-large btn-false" onClick={() => onSubmit({ knew: false })}>
          Ne
        </button>
      </div>
    </div>
  );
}
