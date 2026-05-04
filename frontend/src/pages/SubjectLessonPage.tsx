import { useParams, useSearchParams, useLocation } from "react-router-dom";
import LessonRunner from "../components/lesson/LessonRunner";

export default function SubjectLessonPage() {
  const { subject: subjectSlug } = useParams<{ subject: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const gradeParam = searchParams.get("grade");
  const grade = gradeParam ? parseInt(gradeParam, 10) : undefined;
  const subjectId = (location.state as { subjectId?: number } | null)?.subjectId;

  if (!subjectSlug) return <p>Chybí předmět.</p>;

  return (
    <div className="page lesson-page">
      <LessonRunner
        subjectId={subjectId}
        subject={decodeURIComponent(subjectSlug)}
        grade={grade}
      />
    </div>
  );
}
