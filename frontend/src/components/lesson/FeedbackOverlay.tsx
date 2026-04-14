interface Props {
  isCorrect: boolean;
  explanation: string | null;
  correctAnswer: string;
  onContinue: () => void;
}

export default function FeedbackOverlay({
  isCorrect,
  explanation,
  correctAnswer,
  onContinue,
}: Props) {
  let answerDisplay = "";
  try {
    const parsed = JSON.parse(correctAnswer);
    if (parsed.correct_text) answerDisplay = parsed.correct_text;
    else if (parsed.answer) answerDisplay = parsed.answer;
    else if (parsed.accepted_answers)
      answerDisplay = parsed.accepted_answers.join(", ");
    else if (parsed.correct !== undefined) answerDisplay = String(parsed.correct);
    else if (parsed.correct_value !== undefined)
      answerDisplay = String(parsed.correct_value) + (parsed.unit ? ` ${parsed.unit}` : "");
    else if (parsed.correct_order)
      answerDisplay = parsed.correct_order.join(" → ");
    else if (parsed.pairs)
      answerDisplay = parsed.pairs
        .map((p: { left: string; right: string }) => `${p.left} → ${p.right}`)
        .join(", ");
  } catch {
    answerDisplay = correctAnswer;
  }

  return (
    <div className={`feedback-overlay feedback--${isCorrect ? "correct" : "wrong"}`}>
      <div className="feedback-icon">{isCorrect ? "✓" : "✗"}</div>
      <h3>{isCorrect ? "Správně!" : "Špatně"}</h3>
      {!isCorrect && answerDisplay && (
        <p className="feedback-answer">
          Správná odpověď: <strong>{answerDisplay}</strong>
        </p>
      )}
      {explanation && <p className="feedback-explanation">{explanation}</p>}
      <button className="btn btn-primary" onClick={onContinue} autoFocus>
        Pokračovat
      </button>
    </div>
  );
}
