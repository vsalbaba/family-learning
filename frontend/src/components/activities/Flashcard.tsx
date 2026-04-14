import { useState } from "react";

interface Props {
  onSubmit: (answer: unknown) => void;
}

export default function Flashcard({ onSubmit }: Props) {
  const [revealed, setRevealed] = useState(false);

  if (!revealed) {
    return (
      <div className="activity activity--flashcard">
        <button className="btn btn-primary btn-large" onClick={() => setRevealed(true)}>
          Ukázat odpověď
        </button>
      </div>
    );
  }

  return (
    <div className="activity activity--flashcard">
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
