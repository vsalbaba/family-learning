interface Props {
  current: number;
  total: number;
}

export default function ProgressBar({ current, total }: Props) {
  const pct = total > 0 ? ((current + 1) / total) * 100 : 0;

  return (
    <div className="lesson-progress">
      <div className="progress-text">
        Otázka {current + 1} z {total}
      </div>
      <div className="progress-bar" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
