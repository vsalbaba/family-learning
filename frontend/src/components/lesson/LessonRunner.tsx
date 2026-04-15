import { useState, useRef } from "react";
import type { Question, AnswerResponse, LessonSummary } from "../../types/lesson";
import { startLesson, submitAnswer, getLessonSummary } from "../../api/lessons";
import ProgressBar from "./ProgressBar";
import QuestionCard from "./QuestionCard";
import FeedbackOverlay from "./FeedbackOverlay";
import LessonSummaryView from "./LessonSummary";

type LessonState = "idle" | "loading" | "answering" | "feedback" | "summary";

interface Props {
  packageId: number;
}

export default function LessonRunner({ packageId }: Props) {
  const [state, setState] = useState<LessonState>("idle");
  const [sessionId, setSessionId] = useState<number>(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState<AnswerResponse | null>(null);
  const [summary, setSummary] = useState<LessonSummary | null>(null);
  const [error, setError] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const startTimeRef = useRef<number>(0);

  async function handleStart() {
    setState("loading");
    setError("");
    try {
      const resp = await startLesson(packageId, questionCount);
      setSessionId(resp.session_id);
      setQuestion(resp.question);
      startTimeRef.current = Date.now();
      setState("answering");
    } catch (e: any) {
      setError(e.message);
      setState("idle");
    }
  }

  async function handleAnswer(answer: unknown) {
    if (!question) return;
    const elapsed = Date.now() - startTimeRef.current;
    setState("loading");
    try {
      const resp = await submitAnswer(sessionId, question.item_id, answer, elapsed);
      setFeedback(resp);
      setState("feedback");
    } catch (e: any) {
      setError(e.message);
      setState("answering");
    }
  }

  async function handleContinue() {
    if (!feedback) return;
    if (feedback.next_question) {
      setQuestion(feedback.next_question);
      setFeedback(null);
      startTimeRef.current = Date.now();
      setState("answering");
    } else {
      // Lesson complete — fetch summary
      setState("loading");
      try {
        const s = await getLessonSummary(sessionId);
        setSummary(s);
        setState("summary");
      } catch (e: any) {
        setError(e.message);
        setState("answering");
      }
    }
  }

  if (state === "idle") {
    return (
      <div className="lesson-start">
        <h2>Kolik otázek?</h2>
        <div className="question-count-select">
          {[3, 5, 7, 10, 20].map((n) => (
            <button
              key={n}
              className={`btn ${questionCount === n ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setQuestionCount(n)}
            >
              {n}
            </button>
          ))}
          <button
            className={`btn ${questionCount === 999 ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setQuestionCount(999)}
          >
            Vše
          </button>
        </div>
        <button className="btn btn-primary btn-large" onClick={handleStart}>
          Začít lekci
        </button>
        {error && <p className="lesson-error">{error}</p>}
      </div>
    );
  }

  if (state === "loading") {
    return <div className="lesson-loading">Načítání...</div>;
  }

  if (state === "summary" && summary) {
    return <LessonSummaryView summary={summary} packageId={packageId} />;
  }

  return (
    <div className="lesson-active">
      {question && (
        <>
          <ProgressBar
            current={question.question_index}
            total={question.total_questions}
          />
          {state === "answering" && (
            <QuestionCard
              key={question.item_id}
              question={question}
              onSubmit={handleAnswer}
            />
          )}
          {state === "feedback" && feedback && (
            <FeedbackOverlay
              isCorrect={feedback.is_correct}
              explanation={feedback.explanation}
              correctAnswer={feedback.correct_answer}
              givenAnswer={feedback.given_answer}
              questionText={question.question}
              activityType={question.activity_type}
              ttsLang={question.tts_lang}
              onContinue={handleContinue}
            />
          )}
        </>
      )}
      {error && <p className="lesson-error">{error}</p>}
    </div>
  );
}
