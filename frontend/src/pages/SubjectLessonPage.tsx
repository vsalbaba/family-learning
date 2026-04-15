import { useParams } from "react-router-dom";
import LessonRunner from "../components/lesson/LessonRunner";

export default function SubjectLessonPage() {
  const { subject } = useParams<{ subject: string }>();

  if (!subject) return <p>Chybí předmět.</p>;

  return (
    <div className="page lesson-page">
      <LessonRunner subject={decodeURIComponent(subject)} />
    </div>
  );
}
