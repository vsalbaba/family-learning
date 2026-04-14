import { useParams } from "react-router-dom";
import LessonRunner from "../components/lesson/LessonRunner";

export default function LessonPage() {
  const { packageId } = useParams<{ packageId: string }>();

  if (!packageId) return <p>Chybí ID balíčku.</p>;

  return (
    <div className="page lesson-page">
      <LessonRunner packageId={Number(packageId)} />
    </div>
  );
}
