import { useState, useCallback, useRef, useEffect } from "react";
import type { QuestionConfig, TaskPair, Tier } from "../types";
import {
  generateTaskPair,
  createEmptyHistory,
  pushHistory,
  type QuestionHistory,
} from "../question-gen";

const PENALTY_DURATIONS_MS = [500, 1000, 2000, 4000] as const;

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
  const [penaltyLevel, setPenaltyLevel] = useState(0);
  const [penaltyActive, setPenaltyActive] = useState(false);
  const consecutiveCorrectRef = useRef(0);
  const penaltyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (feedback?.timer) clearTimeout(feedback.timer);
    };
  }, [feedback]);

  useEffect(() => {
    return () => {
      if (penaltyTimerRef.current) clearTimeout(penaltyTimerRef.current);
    };
  }, []);

  const advancePair = useCallback(() => {
    const newPair = generateTaskPair(easyHistRef.current, hardHistRef.current, config);
    setPair(newPair);
    setCorrectSide(randomSides());
  }, [config]);

  const handleClick = useCallback(
    (tier: Tier, answeredCorrectly: boolean) => {
      if (!gameActive || feedback || penaltyActive) return;

      const question = tier === "easy" ? pair.easy : pair.hard;
      pushHistory(
        tier === "easy" ? easyHistRef.current : hardHistRef.current,
        question,
        config.recentHistorySize,
      );

      onAnswer(tier, answeredCorrectly);

      if (answeredCorrectly) {
        consecutiveCorrectRef.current += 1;
        if (consecutiveCorrectRef.current >= 2) {
          setPenaltyLevel((prev) => Math.max(0, prev - 1));
          consecutiveCorrectRef.current = 0;
        }
        const timer = setTimeout(() => {
          setFeedback(null);
          advancePair();
        }, 200);
        setFeedback({ tier, correct: true, timer });
      } else {
        const currentLevel = penaltyLevel;
        consecutiveCorrectRef.current = 0;
        const timer = setTimeout(() => {
          setFeedback(null);
          setPenaltyActive(true);
          penaltyTimerRef.current = setTimeout(() => {
            setPenaltyActive(false);
            setPenaltyLevel((prev) => Math.min(3, prev + 1));
            advancePair();
          }, PENALTY_DURATIONS_MS[currentLevel]);
        }, 300);
        setFeedback({ tier, correct: false, timer });
      }
    },
    [gameActive, feedback, penaltyActive, pair, config, penaltyLevel, onAnswer, advancePair],
  );

  if (!gameActive) return null;

  const locked = feedback !== null || penaltyActive;

  return (
    <div className="arena-questions">
      <TaskCard
        question={pair.easy}
        tier="easy"
        correctSide={correctSide.easy}
        feedback={feedback?.tier === "easy" ? feedback : null}
        disabled={locked}
        penaltyActive={penaltyActive}
        onAnswer={(correct) => handleClick("easy", correct)}
      />
      <TaskCard
        question={pair.hard}
        tier="hard"
        correctSide={correctSide.hard}
        feedback={feedback?.tier === "hard" ? feedback : null}
        disabled={locked}
        penaltyActive={penaltyActive}
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
  penaltyActive: boolean;
  onAnswer: (correct: boolean) => void;
}

function TaskCard({
  question,
  tier,
  correctSide,
  feedback,
  disabled,
  penaltyActive,
  onAnswer,
}: TaskCardProps) {
  const leftAnswer =
    correctSide === "left" ? question.correctAnswer : question.wrongAnswer;
  const rightAnswer =
    correctSide === "right" ? question.correctAnswer : question.wrongAnswer;

  let cardClass = `arena-task-card arena-task-card--${tier}`;
  if (penaltyActive) {
    cardClass += " arena-task-card--penalty";
  } else if (feedback) {
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
