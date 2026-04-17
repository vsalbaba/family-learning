import { useParams, useSearchParams } from "react-router-dom";
import LessonRunner from "../components/lesson/LessonRunner";

export default function SubjectLessonPage() {
  const { subject } = useParams<{ subject: string }>();
  const [searchParams] = useSearchParams();
  const gradeParam = searchParams.get("grade");
  const grade = gradeParam ? parseInt(gradeParam, 10) : undefined;

  if (!subject) return <p>Chybí předmět.</p>;

  return (
    <div className="page lesson-page">
      <LessonRunner subject={decodeURIComponent(subject)} grade={grade} />
    </div>
  );
}
