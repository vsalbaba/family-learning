"""Text-to-speech synthesis with Piper and WAV caching."""

import hashlib
import io
import logging
import wave
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from piper import PiperVoice

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

VOICE_MAP = {
    "en": "en/en_US-lessac-high.onnx",
    "de": "de/de_DE-thorsten-high.onnx",
}

_loaded_voices: dict[str, PiperVoice] = {}


def _get_voice(lang: str) -> PiperVoice:
    """Load and cache a Piper voice model for the given language."""
    if lang in _loaded_voices:
        return _loaded_voices[lang]
    model_path = Path(settings.tts_voices_dir) / VOICE_MAP[lang]
    if not model_path.exists():
        raise HTTPException(
            status_code=503,
            detail=f"Hlasový model pro '{lang}' není nainstalován",
        )
    voice = PiperVoice.load(str(model_path))
    _loaded_voices[lang] = voice
    return voice


@router.get("")
def text_to_speech(
    text: str = Query(..., max_length=500),
    lang: str = Query("en"),
):
    """Synthesize text to a WAV audio file, returning a cached result if available."""
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text nesmí být prázdný")

    if lang not in VOICE_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Nepodporovaný jazyk: {lang}. Podporované: {', '.join(VOICE_MAP)}",
        )

    logger.info("TTS: lang=%s text_len=%d", lang, len(text))

    # Cache lookup
    cache_dir = Path(settings.tts_cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.sha256(f"{lang}:{text}".encode()).hexdigest()
    cache_path = cache_dir / f"{cache_key}.wav"

    if cache_path.exists():
        return FileResponse(cache_path, media_type="audio/wav")

    # Synthesize with Piper
    voice = _get_voice(lang)
    audio_chunks = list(voice.synthesize(text))
    if not audio_chunks:
        raise HTTPException(status_code=500, detail="TTS nevygenerovalo žádný zvuk")

    # Combine chunks into a single WAV
    sample_rate = audio_chunks[0].sample_rate
    sample_width = audio_chunks[0].sample_width
    channels = audio_chunks[0].sample_channels

    all_audio = np.concatenate([chunk.audio_float_array for chunk in audio_chunks])
    # Convert float [-1, 1] to int16
    audio_int16 = (all_audio * 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_int16.tobytes())

    cache_path.write_bytes(buf.getvalue())
    return FileResponse(cache_path, media_type="audio/wav")
