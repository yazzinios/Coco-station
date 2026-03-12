import os
import uuid
from gtts import gTTS

TTS_DIR = "/app/data/announcements"
os.makedirs(TTS_DIR, exist_ok=True)

def generate_tts(text: str, lang: str = "en") -> str:
    """
    Generate an MP3 from text using Google TTS.
    Returns the absolute path to the generated file.
    """
    tts = gTTS(text=text, lang=lang)
    filename = f"tts_{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(TTS_DIR, filename)
    tts.save(filepath)
    return filepath
