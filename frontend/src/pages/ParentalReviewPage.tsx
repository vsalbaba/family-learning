import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getParentalReview } from "../api/parentalReviews";
import type { ParentalReview } from "../types/parentalReview";
import ParentalReviewRunner from "../components/lesson/ParentalReviewRunner";

export default function ParentalReviewPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const [review, setReview] = useState<ParentalReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reviewId) return;
    getParentalReview(Number(reviewId))
      .then(setReview)
      .catch((err) => setError(err instanceof Error ? err.message : "Neznámá chyba"))
      .finally(() => setLoading(false));
  }, [reviewId]);

  if (!reviewId) return <p>Chybí ID opakování.</p>;
  if (loading) return <div className="lesson-loading">Načítání...</div>;
  if (error) return <p className="lesson-error">{error}</p>;
  if (!review) return <p>Opakování nenalezeno.</p>;

  return (
    <div className="page lesson-page">
      <ParentalReviewRunner review={review} />
    </div>
  );
}
