interface Props {
  onSubmit: (answer: unknown) => void;
}

export default function TrueFalse({ onSubmit }: Props) {
  return (
    <div className="activity activity--tf">
      <div className="tf-buttons">
        <button className="btn btn-large btn-true" onClick={() => onSubmit({ answer: true })}>
          Pravda
        </button>
        <button className="btn btn-large btn-false" onClick={() => onSubmit({ answer: false })}>
          Nepravda
        </button>
      </div>
    </div>
  );
}
