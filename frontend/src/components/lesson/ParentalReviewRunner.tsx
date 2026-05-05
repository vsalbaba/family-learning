import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Question, AnswerResponse } from "../../types/lesson";
import type { ParentalReview } from "../../types/parentalReview";
import { getNextBatch } from "../../api/parentalReviews";
import { submitAnswer } from "../../api/lessons";
import { useAuth } from "../../contexts/AuthContext";
import ProgressBar from "./ProgressBar";
import QuestionCard from "./QuestionCard";
import FeedbackOverlay from "./FeedbackOverlay";

type RunnerState = "idle" | "loading" | "answering" | "feedback" | "completed";

interface Props {
  review: ParentalReview;
}

export default function ParentalReviewRunner({ review }: Props) {
  const navigate = useNavigate();
  const { updateRewardState } = useAuth();

  const [state, setState] = useState<RunnerState>("idle");
  const [sessionId, setSessionId] = useState<number>(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState<AnswerResponse | null>(null);
  const [reviewProgress, setReviewProgress] = useState(review.current_credits);
  const [reviewTarget] = useState(review.target_credits);
  const [reviewCompleted, setReviewCompleted] = useState(review.status === "completed");
  const [error, setError] = useState("");
  const startTimeRef = useRef<number>(0);

  async function handleStart() {
    setState("loading");
    setError("");
    try {
      const resp = await getNextBatch(review.id);
      setSessionId(resp.session_id);
      setQuestion(resp.question);
      setReviewProgress(resp.review_progress);
      startTimeRef.current = Date.now();
      setState("answering");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neznámá chyba");
      setState("idle");
    }
  }

  async function handleAnswer(answer: unknown) {
    if (!question) return;
    const elapsed = Date.now() - startTimeRef.current;
    setState("loading");
    try {
      const resp = await submitAnswer(sessionId, question.item_id, answer, elapsed);
      if (resp.reward) {
        updateRewardState(resp.reward);
      }
      if (resp.parental_review) {
        setReviewProgress(resp.parental_review.progress);
        if (resp.parental_review.is_completed) {
          setReviewCompleted(true);
        }
      }

      if (reviewCompleted || resp.parental_review?.is_completed) {
        // Review finished — show feedback then completed screen
        setFeedback(resp);
        setState("feedback");
        return;
      }

      if (question.activity_type === "flashcard") {
        // Skip feedback overlay for flashcards
        if (resp.next_question) {
          setQuestion(resp.next_question);
          startTimeRef.current = Date.now();
          setState("answering");
        } else {
          // Batch done, fetch next batch
          await fetchNextBatch();
        }
      } else {
        setFeedback(resp);
        setState("feedback");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neznámá chyba");
      setState("answering");
    }
  }

  async function fetchNextBatch() {
    setState("loading");
    try {
      const resp = await getNextBatch(review.id);
      setSessionId(resp.session_id);
      setQuestion(resp.question);
      setReviewProgress(resp.review_progress);
      if (resp.review_status !== "active") {
        setReviewCompleted(true);
        setState("completed");
      } else {
        startTimeRef.current = Date.now();
        setState("answering");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neznámá chyba");
      setState("idle");
    }
  }

  async function handleContinue() {
    if (!feedback) return;

    const isCompleted = reviewCompleted || feedback.parental_review?.is_completed;
    if (isCompleted) {
      setState("completed");
      return;
    }

    if (feedback.next_question) {
      setQuestion(feedback.next_question);
      setFeedback(null);
      startTimeRef.current = Date.now();
      setState("answering");
    } else {
      // Batch exhausted — fetch next batch
      setFeedback(null);
      await fetchNextBatch();
    }
  }

  // ── Completed screen ────────────────────────────────────────────────────
  if (state === "completed" || reviewCompleted) {
    return (
      <div className="lesson-summary">
        <div className="summary-header">
          <span className="summary-emoji">🏆</span>
          <h2>Splněno!</h2>
          <p className="summary-score">
            {reviewProgress} / {reviewTarget} kreditů
          </p>
        </div>
        <p className="lesson-review-note">
          Skvělá práce! Splnil/a jsi opakování zadané rodičem.
        </p>
        <div className="summary-actions">
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            Zpět domů
          </button>
        </div>
      </div>
    );
  }

  // ── Idle screen ─────────────────────────────────────────────────────────
  if (state === "idle") {
    return (
      <div className="lesson-start">
        <h2>Opakování od rodiče</h2>
        {review.note && <p className="lesson-review-note">{review.note}</p>}
        <div className="review-progress-info">
          <span>
            Splněno: {reviewProgress} / {reviewTarget} kreditů
          </span>
        </div>
        <div className="lesson-start-actions">
          <button className="btn btn-primary btn-large" onClick={handleStart}>
            Začít
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/")}>
            Zpět
          </button>
        </div>
        {error && <p className="lesson-error">{error}</p>}
      </div>
    );
  }

  // ── Loading screen ───────────────────────────────────────────────────────
  if (state === "loading") {
    return <div className="lesson-loading">Načítání...</div>;
  }

  // ── Active lesson screen ─────────────────────────────────────────────────
  return (
    <div className="lesson-active">
      {/* Review progress indicator */}
      <div className="review-progress-bar">
        <div
          className="review-progress-bar__fill"
          style={{ width: `${Math.min(100, (reviewProgress / reviewTarget) * 100)}%` }}
        />
        <span className="review-progress-bar__label">
          {reviewProgress} / {reviewTarget}
        </span>
      </div>

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
              reward={feedback.reward}
              image={question.image}
            />
          )}
        </>
      )}
      {error && <p className="lesson-error">{error}</p>}
      <button className="btn btn-secondary btn-end-lesson" onClick={() => navigate("/")}>
        Ukončit
      </button>
    </div>
  );
}
