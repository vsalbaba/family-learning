import { useState } from "react";

interface Props {
  /** JSON string: `{ items: string[] }`. Items in shuffled order for the child to reorder. */
  answerData: string;
  /** Called with `{ order: string[] }` — items in the child's chosen order. */
  onSubmit: (answer: unknown) => void;
}

export default function Ordering({ answerData, onSubmit }: Props) {
  const { items } = JSON.parse(answerData) as { items: string[] };
  const [order, setOrder] = useState<string[]>(items);

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...order];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setOrder(next);
  }

  function moveDown(index: number) {
    if (index === order.length - 1) return;
    const next = [...order];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setOrder(next);
  }

  return (
    <div className="activity activity--ordering">
      <div className="ordering-list">
        {order.map((item, i) => (
          <div key={item} className="ordering-item">
            <span className="ordering-num">{i + 1}.</span>
            <span className="ordering-text">{item}</span>
            <div className="ordering-controls">
              <button
                className="btn btn-small"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                aria-label={`Posunout "${item}" nahoru`}
              >
                ↑
              </button>
              <button
                className="btn btn-small"
                onClick={() => moveDown(i)}
                disabled={i === order.length - 1}
                aria-label={`Posunout "${item}" dolů`}
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={() => onSubmit({ order })}>
        Odpovědět
      </button>
    </div>
  );
}
