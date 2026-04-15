import { useParams, useSearchParams } from "react-router-dom";
import PreviewLessonRunner from "../components/lesson/PreviewLessonRunner";

export default function PreviewLessonPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const itemId = searchParams.get("item");

  if (!id) return <p>Chybí ID balíčku.</p>;

  return (
    <div className="page lesson-page">
      <PreviewLessonRunner
        packageId={Number(id)}
        singleItemId={itemId ? Number(itemId) : undefined}
      />
    </div>
  );
}
