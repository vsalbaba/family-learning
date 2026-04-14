import { useState } from "react";

interface Props {
  onSubmit: (answer: unknown) => void;
}

export default function FillIn({ onSubmit }: Props) {
  const [text, setText] = useState("");

  return (
    <div className="activity activity--fillin">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Napiš odpověď..."
        className="fillin-input"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) onSubmit({ text: text.trim() });
        }}
      />
      <button
        className="btn btn-primary"
        disabled={!text.trim()}
        onClick={() => onSubmit({ text: text.trim() })}
      >
        Odpovědět
      </button>
    </div>
  );
}
