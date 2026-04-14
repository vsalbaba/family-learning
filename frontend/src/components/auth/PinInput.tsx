import { useState, useRef, useEffect } from "react";

interface Props {
  length?: number;
  onComplete: (pin: string) => void;
  error?: string;
}

export default function PinInput({ length = 4, onComplete, error }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (error) {
      setDigits(Array(length).fill(""));
      refs.current[0]?.focus();
    }
  }, [error, length]);

  function handleChange(index: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);

    if (value && index < length - 1) {
      refs.current[index + 1]?.focus();
    }

    if (value && index === length - 1) {
      const pin = next.join("");
      if (pin.length === length) onComplete(pin);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  return (
    <div className="pin-input">
      <div className="pin-digits">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="tel"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="pin-digit"
          />
        ))}
      </div>
      {error && <p className="pin-error">{error}</p>}
    </div>
  );
}
