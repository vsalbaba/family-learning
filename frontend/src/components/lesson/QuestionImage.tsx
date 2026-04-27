interface SvgQuestionImage {
  type: "svg";
  svg: string;
  alt?: string | null;
}

interface Props {
  image: SvgQuestionImage;
  compact?: boolean;
}

export default function QuestionImage({ image, compact = false }: Props) {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image.svg)}`;
  return (
    <div className={compact ? "question-image question-image--compact" : "question-image"}>
      <img src={src} alt={image.alt ?? ""} />
    </div>
  );
}
