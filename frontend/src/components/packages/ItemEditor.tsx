import { useState, useRef, useEffect, useCallback } from "react";
import type { ActivityType, PackageItem } from "../../types/package";

interface Props {
  item?: PackageItem;
  activityType: ActivityType;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

interface Pair {
  left: string;
  right: string;
}

function parseAnswerData(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function AutoTextarea({
  value,
  onChange,
  minRows = 2,
  ...rest
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  minRows?: number;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);
  useEffect(resize, [value, resize]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      rows={minRows}
      {...rest}
    />
  );
}

export default function ItemEditor({ item, activityType, onSave, onCancel }: Props) {
  const existing = item ? parseAnswerData(item.answer_data) : {};

  const [question, setQuestion] = useState(item?.question ?? "");
  const [hint, setHint] = useState(item?.hint ?? "");
  const [explanation, setExplanation] = useState(item?.explanation ?? "");

  // flashcard
  const [answer, setAnswer] = useState((existing.answer as string) ?? "");

  // multiple_choice
  const [options, setOptions] = useState<string[]>(
    (existing.options as string[]) ?? ["", "", ""]
  );
  const [correctIndex, setCorrectIndex] = useState<number>(
    (existing.correct as number) ?? 0
  );

  // true_false
  const [tfCorrect, setTfCorrect] = useState<boolean>(
    (existing.correct as boolean) ?? true
  );

  // fill_in
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>(
    (existing.accepted_answers as string[]) ?? [""]
  );
  const [caseSensitive, setCaseSensitive] = useState<boolean>(
    (existing.case_sensitive as boolean) ?? false
  );

  // matching
  const [pairs, setPairs] = useState<Pair[]>(
    (existing.pairs as Pair[]) ?? [
      { left: "", right: "" },
      { left: "", right: "" },
    ]
  );

  // ordering
  const [orderItems, setOrderItems] = useState<string[]>(
    (existing.correct_order as string[]) ?? ["", ""]
  );

  // math_input
  const [correctValue, setCorrectValue] = useState<string>(
    existing.correct_value !== undefined ? String(existing.correct_value) : ""
  );
  const [tolerance, setTolerance] = useState<string>(
    existing.tolerance !== undefined ? String(existing.tolerance) : "0"
  );
  const [unit, setUnit] = useState<string>((existing.unit as string) ?? "");

  function buildAnswerData(): string {
    switch (activityType) {
      case "flashcard":
        return JSON.stringify({ answer });
      case "multiple_choice":
        return JSON.stringify({ options, correct: correctIndex });
      case "true_false":
        return JSON.stringify({ correct: tfCorrect });
      case "fill_in":
        return JSON.stringify({
          accepted_answers: acceptedAnswers.filter((a) => a.trim()),
          case_sensitive: caseSensitive,
        });
      case "matching":
        return JSON.stringify({ pairs });
      case "ordering":
        return JSON.stringify({ correct_order: orderItems.filter((i) => i.trim()) });
      case "math_input": {
        const data: Record<string, unknown> = {
          correct_value: Number(correctValue),
        };
        if (tolerance) data.tolerance = Number(tolerance);
        if (unit) data.unit = unit;
        return JSON.stringify(data);
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {
      question,
      answer_data: buildAnswerData(),
      hint: hint || null,
      explanation: explanation || null,
    };
    if (!item) {
      data.activity_type = activityType;
    }
    onSave(data);
  }

  return (
    <form className="item-editor" onSubmit={handleSubmit}>
      <label>
        Otazka
        <AutoTextarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
          autoFocus
        />
      </label>

      {activityType === "flashcard" && (
        <label>
          Odpoved
          <AutoTextarea value={answer} onChange={(e) => setAnswer(e.target.value)} required />
        </label>
      )}

      {activityType === "multiple_choice" && (
        <fieldset>
          <legend>Moznosti</legend>
          {options.map((opt, i) => (
            <div key={i} className="editor-option-row">
              <label className="editor-radio">
                <input
                  type="radio"
                  name="correct"
                  checked={correctIndex === i}
                  onChange={() => setCorrectIndex(i)}
                />
              </label>
              <input
                value={opt}
                onChange={(e) => {
                  const copy = [...options];
                  copy[i] = e.target.value;
                  setOptions(copy);
                }}
                placeholder={`Moznost ${i + 1}`}
                required
              />
              {options.length > 2 && (
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => {
                    const copy = options.filter((_, j) => j !== i);
                    setOptions(copy);
                    if (correctIndex >= copy.length) setCorrectIndex(copy.length - 1);
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-small btn-secondary"
            onClick={() => setOptions([...options, ""])}
          >
            + Pridat moznost
          </button>
        </fieldset>
      )}

      {activityType === "true_false" && (
        <fieldset>
          <legend>Spravna odpoved</legend>
          <label className="editor-radio-label">
            <input
              type="radio"
              name="tf"
              checked={tfCorrect}
              onChange={() => setTfCorrect(true)}
            />
            Pravda
          </label>
          <label className="editor-radio-label">
            <input
              type="radio"
              name="tf"
              checked={!tfCorrect}
              onChange={() => setTfCorrect(false)}
            />
            Nepravda
          </label>
        </fieldset>
      )}

      {activityType === "fill_in" && (
        <>
          <fieldset>
            <legend>Akceptovane odpovedi</legend>
            {acceptedAnswers.map((a, i) => (
              <div key={i} className="editor-option-row">
                <input
                  value={a}
                  onChange={(e) => {
                    const copy = [...acceptedAnswers];
                    copy[i] = e.target.value;
                    setAcceptedAnswers(copy);
                  }}
                  required
                />
                {acceptedAnswers.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    onClick={() => setAcceptedAnswers(acceptedAnswers.filter((_, j) => j !== i))}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={() => setAcceptedAnswers([...acceptedAnswers, ""])}
            >
              + Pridat odpoved
            </button>
          </fieldset>
          <label className="editor-checkbox">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Rozlisovat velka/mala pismena
          </label>
        </>
      )}

      {activityType === "matching" && (
        <fieldset>
          <legend>Pary</legend>
          {pairs.map((pair, i) => (
            <div key={i} className="editor-pair-row">
              <input
                value={pair.left}
                onChange={(e) => {
                  const copy = [...pairs];
                  copy[i] = { ...copy[i], left: e.target.value };
                  setPairs(copy);
                }}
                placeholder="Levy"
                required
              />
              <span className="editor-pair-arrow">&rarr;</span>
              <input
                value={pair.right}
                onChange={(e) => {
                  const copy = [...pairs];
                  copy[i] = { ...copy[i], right: e.target.value };
                  setPairs(copy);
                }}
                placeholder="Pravy"
                required
              />
              {pairs.length > 2 && (
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => setPairs(pairs.filter((_, j) => j !== i))}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-small btn-secondary"
            onClick={() => setPairs([...pairs, { left: "", right: "" }])}
          >
            + Pridat par
          </button>
        </fieldset>
      )}

      {activityType === "ordering" && (
        <fieldset>
          <legend>Spravne poradi</legend>
          {orderItems.map((item, i) => (
            <div key={i} className="editor-option-row">
              <span className="editor-order-num">{i + 1}.</span>
              <input
                value={item}
                onChange={(e) => {
                  const copy = [...orderItems];
                  copy[i] = e.target.value;
                  setOrderItems(copy);
                }}
                required
              />
              {orderItems.length > 2 && (
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => setOrderItems(orderItems.filter((_, j) => j !== i))}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-small btn-secondary"
            onClick={() => setOrderItems([...orderItems, ""])}
          >
            + Pridat polozku
          </button>
        </fieldset>
      )}

      {activityType === "math_input" && (
        <>
          <label>
            Spravna hodnota
            <input
              type="number"
              step="any"
              value={correctValue}
              onChange={(e) => setCorrectValue(e.target.value)}
              required
            />
          </label>
          <label>
            Tolerance
            <input
              type="number"
              step="any"
              min="0"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
            />
          </label>
          <label>
            Jednotka
            <input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </label>
        </>
      )}

      <label>
        Napoveda
        <AutoTextarea value={hint} onChange={(e) => setHint(e.target.value)} minRows={1} />
      </label>
      <label>
        Vysvetleni
        <AutoTextarea value={explanation} onChange={(e) => setExplanation(e.target.value)} minRows={1} />
      </label>

      <div className="editor-actions">
        <button type="submit" className="btn btn-primary">
          Ulozit
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Zrusit
        </button>
      </div>
    </form>
  );
}
