import { useState, useCallback, useRef, useEffect } from "react";
import type { QuestionConfig, TaskPair, Tier } from "../types";
import {
  generateTaskPair,
  createEmptyHistory,
  pushHistory,
  type QuestionHistory,
} from "../question-gen";

interface Props {
  config: QuestionConfig;
  gameActive: boolean;
  onAnswer: (tier: Tier, correct: boolean) => void;
}

type FeedbackState = {
  tier: Tier;
  correct: boolean;
  timer: ReturnType<typeof setTimeout>;
} | null;

export default function QuestionPanel({ config, gameActive, onAnswer }: Props) {
  const easyHistRef = useRef<QuestionHistory>(createEmptyHistory());
  const hardHistRef = useRef<QuestionHistory>(createEmptyHistory());
  const [pair, setPair] = useState<TaskPair>(() => {
    const easyHist = createEmptyHistory();
    const hardHist = createEmptyHistory();
    return generateTaskPair(easyHist, hardHist, config);
  });
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [correctSide, setCorrectSide] = useState(() => randomSides());

  // Cleanup feedback timer on unmount
  useEffect(() => {
    return () => {
      if (feedback?.timer) clearTimeout(feedback.timer);
    };
  }, [feedback]);

  const advancePair = useCallback(() => {
    const newPair = generateTaskPair(easyHistRef.current, hardHistRef.current, config);
    setPair(newPair);
    setCorrectSide(randomSides());
  }, [config]);

  const handleClick = useCallback(
    (tier: Tier, answeredCorrectly: boolean) => {
      if (!gameActive || feedback) return;

      const question = tier === "easy" ? pair.easy : pair.hard;
      pushHistory(
        tier === "easy" ? easyHistRef.current : hardHistRef.current,
        question,
        config.recentHistorySize,
      );

      onAnswer(tier, answeredCorrectly);

      const feedbackDuration = answeredCorrectly ? 200 : 300;
      const timer = setTimeout(() => {
        setFeedback(null);
        advancePair();
      }, feedbackDuration);

      setFeedback({ tier, correct: answeredCorrectly, timer });
    },
    [gameActive, feedback, pair, config, onAnswer, advancePair],
  );

  if (!gameActive) return null;

  return (
    <div className="arena-questions">
      <TaskCard
        question={pair.easy}
        tier="easy"
        correctSide={correctSide.easy}
        feedback={feedback?.tier === "easy" ? feedback : null}
        disabled={feedback !== null}
        onAnswer={(correct) => handleClick("easy", correct)}
      />
      <TaskCard
        question={pair.hard}
        tier="hard"
        correctSide={correctSide.hard}
        feedback={feedback?.tier === "hard" ? feedback : null}
        disabled={feedback !== null}
        onAnswer={(correct) => handleClick("hard", correct)}
      />
    </div>
  );
}

function randomSides() {
  return {
    easy: (Math.random() < 0.5 ? "left" : "right") as "left" | "right",
    hard: (Math.random() < 0.5 ? "left" : "right") as "left" | "right",
  };
}

// ── TaskCard ────────────────────────────────────────────────────────

interface TaskCardProps {
  question: { text: string; correctAnswer: number; wrongAnswer: number };
  tier: Tier;
  correctSide: "left" | "right";
  feedback: FeedbackState;
  disabled: boolean;
  onAnswer: (correct: boolean) => void;
}

function TaskCard({
  question,
  tier,
  correctSide,
  feedback,
  disabled,
  onAnswer,
}: TaskCardProps) {
  const leftAnswer =
    correctSide === "left" ? question.correctAnswer : question.wrongAnswer;
  const rightAnswer =
    correctSide === "right" ? question.correctAnswer : question.wrongAnswer;

  let cardClass = `arena-task-card arena-task-card--${tier}`;
  if (feedback) {
    cardClass += feedback.correct
      ? " arena-task-card--correct"
      : " arena-task-card--wrong";
  }

  return (
    <div className={cardClass}>
      <div className="arena-task-tier">
        {tier === "easy" ? "⚔" : "⭐"}
      </div>
      <div className="arena-task-text">{question.text}</div>
      <div className="arena-task-answers">
        <button
          className="btn arena-answer-btn"
          disabled={disabled}
          onClick={() => onAnswer(correctSide === "left")}
        >
          {leftAnswer}
        </button>
        <button
          className="btn arena-answer-btn"
          disabled={disabled}
          onClick={() => onAnswer(correctSide === "right")}
        >
          {rightAnswer}
        </button>
      </div>
    </div>
  );
}
