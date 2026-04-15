import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { PackageItem, ActivityType } from "../../types/package";
import type { AnswerResponse } from "../../types/lesson";
import { getPackage, getItemChildView, checkItemAnswer } from "../../api/packages";
import type { ChildViewItem } from "../../api/packages";
import ProgressBar from "./ProgressBar";
import QuestionCard from "./QuestionCard";
import FeedbackOverlay from "./FeedbackOverlay";

type State = "loading" | "answering" | "feedback" | "summary";

interface AnswerRecord {
  question: string;
  activityType: string;
  isCorrect: boolean;
  givenAnswer: string;
  correctAnswer: string;
}

interface Props {
  packageId: number;
  /** If provided, preview only this single item instead of the whole package. */
  singleItemId?: number;
}

export default function PreviewLessonRunner({ packageId, singleItemId }: Props) {
  const navigate = useNavigate();
  const [state, setState] = useState<State>("loading");
  const [items, setItems] = useState<PackageItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [childView, setChildView] = useState<ChildViewItem | null>(null);
  const [feedback, setFeedback] = useState<AnswerResponse | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [error, setError] = useState("");
  const [packageName, setPackageName] = useState("");
  const [ttsLang, setTtsLang] = useState<string | null>(null);

  useEffect(() => {
    loadItems();
  }, [packageId, singleItemId]);

  async function loadItems() {
    try {
      const pkg = await getPackage(packageId);
      setPackageName(pkg.name);
      setTtsLang(pkg.tts_lang);
      const list = singleItemId
        ? pkg.items.filter((it) => it.id === singleItemId)
        : pkg.items;
      if (list.length === 0) {
        setError("Balíček nemá žádné otázky.");
        return;
      }
      setItems(list);
      await loadChildView(list[0]);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function loadChildView(item: PackageItem) {
    const cv = await getItemChildView(packageId, item.id);
    setChildView(cv);
    setState("answering");
  }

  async function handleAnswer(answer: unknown) {
    const item = items[currentIndex];
    if (!item) return;
    setState("loading");
    try {
      const givenJson = JSON.stringify(answer);
      const resp = await checkItemAnswer(packageId, item.id, givenJson);
      setAnswers((prev) => [
        ...prev,
        {
          question: item.question,
          activityType: item.activity_type,
          isCorrect: resp.is_correct,
          givenAnswer: resp.given_answer,
          correctAnswer: resp.correct_answer,
        },
      ]);
      if (item.activity_type === "flashcard") {
        // Skip feedback overlay — go straight to next question or summary
        const nextIdx = currentIndex + 1;
        if (nextIdx >= items.length) {
          setState("summary");
        } else {
          setCurrentIndex(nextIdx);
          await loadChildView(items[nextIdx]);
        }
      } else {
        setFeedback(resp);
        setState("feedback");
      }
    } catch (e: any) {
      setError(e.message);
      setState("answering");
    }
  }

  async function handleContinue() {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= items.length) {
      setState("summary");
      return;
    }
    setCurrentIndex(nextIdx);
    setState("loading");
    try {
      await loadChildView(items[nextIdx]);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (error) {
    return (
      <div className="lesson-start">
        <p className="lesson-error">{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          Zpět
        </button>
      </div>
    );
  }

  if (state === "loading") {
    return <div className="lesson-loading">Načítání...</div>;
  }

  if (state === "summary") {
    const correct = answers.filter((a) => a.isCorrect).length;
    const total = answers.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
      <div className="lesson-summary">
        <div className="preview-banner">Náhled rodiče</div>
        <div className="summary-header">
          <h2>
            {correct}/{total} ({pct}%)
          </h2>
          <p className="summary-score">{packageName}</p>
        </div>
        <div className="summary-answers">
          {answers.map((a, i) => (
            <div
              key={i}
              className={`summary-answer summary-answer--${a.isCorrect ? "correct" : "wrong"}`}
            >
              <span className="summary-icon">{a.isCorrect ? "✓" : "✗"}</span>
              <span>{a.question}</span>
            </div>
          ))}
        </div>
        <div className="summary-actions">
          <button className="btn btn-primary" onClick={() => navigate(-1)}>
            Zpět na balíček
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setAnswers([]);
              setCurrentIndex(0);
              setState("loading");
              loadChildView(items[0]);
            }}
          >
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }

  const currentItem = items[currentIndex];
  const questionForCard = childView
    ? {
        item_id: currentItem.id,
        question_index: currentIndex,
        total_questions: items.length,
        activity_type: currentItem.activity_type as ActivityType,
        question: currentItem.question,
        answer_data: childView.answer_data,
        hint: currentItem.hint,
        tts_lang: ttsLang,
      }
    : null;

  return (
    <div className="lesson-active">
      <div className="preview-banner">Náhled rodiče — odpovědi se neukládají</div>
      {questionForCard && (
        <>
          <ProgressBar current={currentIndex} total={items.length} />
          {state === "answering" && (
            <QuestionCard
              key={currentItem.id}
              question={questionForCard}
              onSubmit={handleAnswer}
            />
          )}
          {state === "feedback" && feedback && (
            <FeedbackOverlay
              isCorrect={feedback.is_correct}
              explanation={feedback.explanation}
              correctAnswer={feedback.correct_answer}
              givenAnswer={feedback.given_answer}
              questionText={currentItem.question}
              activityType={currentItem.activity_type as ActivityType}
              ttsLang={ttsLang}
              onContinue={handleContinue}
              reward={null}
            />
          )}
        </>
      )}
    </div>
  );
}
