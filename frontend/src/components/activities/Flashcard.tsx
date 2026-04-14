import { useState } from "react";

interface Props {
  answerData: string;
  onSubmit: (answer: unknown) => void;
}

export default function Flashcard({ answerData, onSubmit }: Props) {
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
      <p className="flashcard-answer">{parsed.answer}</p>
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
