import { useState, useRef } from "react";

interface Props {
  text: string;
  lang: string;
}

export default function SpeakButton({ text, lang }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!text.trim()) return null;

  async function handleClick() {
    if (state !== "idle") return;
    setState("loading");
    try {
      const params = new URLSearchParams({ text, lang });
      const resp = await fetch(`/api/tts?${params}`);
      if (!resp.ok) throw new Error("TTS failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setState("idle");
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setState("idle");
        URL.revokeObjectURL(url);
      };
      setState("playing");
      await audio.play();
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      className={`speak-btn ${state !== "idle" ? "speak-btn--active" : ""}`}
      onClick={handleClick}
      disabled={state !== "idle"}
      title="Poslechnout"
      type="button"
    >
      {state === "loading" ? "\u23F3" : "\uD83D\uDD0A"}
    </button>
  );
}
