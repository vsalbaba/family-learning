import type { ActivityType } from "../../types/package";
import type { QuestionImage as QuestionImageType, RewardInfo } from "../../types/lesson";
import SpeakButton from "../common/SpeakButton";
import QuestionImage from "./QuestionImage";
import RewardFeedback from "./RewardFeedback";

interface Props {
  isCorrect: boolean;
  explanation: string | null;
  correctAnswer: string;
  givenAnswer: string;
  questionText: string;
  activityType: ActivityType;
  ttsLang: string | null;
  onContinue: () => void;
  reward: RewardInfo | null;
  image?: QuestionImageType;
}

function formatAnswer(json: string, activityType: ActivityType, isGiven: boolean): string {
  try {
    const parsed = JSON.parse(json);

    if (isGiven) {
      if (activityType === "multiple_choice" && parsed.selected_text)
        return parsed.selected_text;
      if (activityType === "true_false" && parsed.answer !== undefined)
        return parsed.answer ? "Pravda" : "Nepravda";
      if (activityType === "fill_in" && parsed.text)
        return parsed.text;
      if (activityType === "matching" && parsed.pairs)
        return parsed.pairs
          .map((p: { left: string; right: string }) => `${p.left} → ${p.right}`)
          .join(", ");
      if (activityType === "ordering" && parsed.order)
        return parsed.order.join(" → ");
      if (activityType === "math_input" && parsed.value !== undefined)
        return String(parsed.value);
      if (activityType === "flashcard") return "";
      return "";
    }

    if (parsed.correct_text) return parsed.correct_text;
    if (parsed.answer) return parsed.answer;
    if (parsed.accepted_answers)
      return parsed.accepted_answers.join(", ");
    if (parsed.correct !== undefined)
      return activityType === "true_false"
        ? (parsed.correct ? "Pravda" : "Nepravda")
        : String(parsed.correct);
    if (parsed.correct_value !== undefined)
      return String(parsed.correct_value) + (parsed.unit ? ` ${parsed.unit}` : "");
    if (parsed.correct_order)
      return parsed.correct_order.join(" → ");
    if (parsed.pairs)
      return parsed.pairs
        .map((p: { left: string; right: string }) => `${p.left} → ${p.right}`)
        .join(", ");
    return "";
  } catch {
    return json;
  }
}

export default function FeedbackOverlay({
  isCorrect,
  explanation,
  correctAnswer,
  givenAnswer,
  questionText,
  activityType,
  ttsLang,
  onContinue,
  reward,
  image,
}: Props) {
  const correctDisplay = formatAnswer(correctAnswer, activityType, false);
  const givenDisplay = formatAnswer(givenAnswer, activityType, true);

  return (
    <div className={`feedback-overlay feedback--${isCorrect ? "correct" : "wrong"}`} aria-live="polite">
      <div className="feedback-icon">{isCorrect ? "✓" : "✗"}</div>
      <h3>{isCorrect ? "Správně!" : "Špatně"}</h3>
      {!isCorrect && givenDisplay && (
        <p className="feedback-given">
          Tvoje odpověď: <strong>{givenDisplay}</strong>
          {ttsLang && <SpeakButton text={givenDisplay} lang={ttsLang} />}
        </p>
      )}
      {image?.type === "svg" && <QuestionImage image={image} compact />}
      <p className="feedback-question">
        {questionText}
        {ttsLang && <SpeakButton text={questionText} lang={ttsLang} />}
      </p>
      {correctDisplay && (
        <p className="feedback-answer">
          Správná odpověď: <strong>{correctDisplay}</strong>
          {ttsLang && <SpeakButton text={correctDisplay} lang={ttsLang} />}
        </p>
      )}
      {explanation && <p className="feedback-explanation">{explanation}</p>}
      {reward && (reward.progress_gained > 0 || reward.tokens_suppressed) && <RewardFeedback reward={reward} />}
      <button className="btn btn-primary" onClick={onContinue} autoFocus>
        Pokračovat
      </button>
    </div>
  );
}
