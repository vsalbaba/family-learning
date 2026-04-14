import type { Question } from "../../types/lesson";
import MultipleChoice from "../activities/MultipleChoice";
import TrueFalse from "../activities/TrueFalse";
import FillIn from "../activities/FillIn";
import Flashcard from "../activities/Flashcard";
import Matching from "../activities/Matching";
import Ordering from "../activities/Ordering";
import MathInput from "../activities/MathInput";

interface Props {
  question: Question;
  onSubmit: (answer: unknown) => void;
}

export default function QuestionCard({ question, onSubmit }: Props) {
  const { activity_type, question: text, hint, answer_data } = question;

  function renderActivity() {
    switch (activity_type) {
      case "multiple_choice":
        return <MultipleChoice answerData={answer_data} onSubmit={onSubmit} />;
      case "true_false":
        return <TrueFalse onSubmit={onSubmit} />;
      case "fill_in":
        return <FillIn onSubmit={onSubmit} />;
      case "flashcard":
        return <Flashcard onSubmit={onSubmit} />;
      case "matching":
        return <Matching answerData={answer_data} onSubmit={onSubmit} />;
      case "ordering":
        return <Ordering answerData={answer_data} onSubmit={onSubmit} />;
      case "math_input":
        return <MathInput answerData={answer_data} onSubmit={onSubmit} />;
      default:
        return <p>Neznámý typ otázky: {activity_type}</p>;
    }
  }

  return (
    <div className="question-card">
      <h2 className="question-text">{text}</h2>
      {hint && <p className="question-hint">Nápověda: {hint}</p>}
      {renderActivity()}
    </div>
  );
}
