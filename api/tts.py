import os
import uuid
import edge_tts

TTS_DIR = "/app/data/announcements"
os.makedirs(TTS_DIR, exist_ok=True)

# Maps simple lang codes to edge-tts voice names
VOICE_MAP = {
    "en":  "en-US-AriaNeural",
    "fr":  "fr-FR-DeniseNeural",
    "ar":  "ar-SA-ZariyahNeural",
    "es":  "es-ES-ElviraNeural",
    "de":  "de-DE-KatjaNeural",
    "it":  "it-IT-ElsaNeural",
}

async def generate_tts(text: str, lang: str = "en") -> str:
    """
    Generate an MP3 from text using Microsoft Edge TTS (edge-tts).
    Returns the absolute path to the generated file.

    NOTE: This function is async — call it with `await` from an async context.
    Using asyncio.run() inside a running FastAPI event loop raises RuntimeError.
    """
    voice = VOICE_MAP.get(lang, "en-US-AriaNeural")
    filename = f"tts_{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(TTS_DIR, filename)
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(filepath)
    return filepath
