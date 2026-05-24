import os
import io
import base64
import logging
from typing import Optional
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
import httpx

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)


class ElevenLabsService:
    def __init__(self):
        self.api_key = os.getenv("ELEVENLABS_API_KEY")
        if not self.api_key or "YOUR_" in self.api_key:
            logger.warning("ELEVENLABS_API_KEY not properly set. Voice features will be disabled.")
            self.client = None
        else:
            self.client = ElevenLabs(api_key=self.api_key)

    async def text_to_speech(self, text: str, voice_id: str) -> Optional[bytes]:
        if not self.client:
            return None
        try:
            audio = self.client.text_to_speech.convert(
                text=text,
                voice_id=voice_id,
                model_id="eleven_flash_v2_5",
                output_format="mp3_44100_128",
            )
            return b"".join(audio)
        except Exception as e:
            logger.error(f"TTS error: {e}")
            return None

    async def speech_to_text(self, audio_bytes: bytes) -> Optional[str]:
        if not self.api_key or "YOUR_" in self.api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                files = {"file": ("audio.webm", io.BytesIO(audio_bytes), "audio/webm")}
                data = {"model_id": "scribe_v1"}
                headers = {"xi-api-key": self.api_key}
                response = await client.post(
                    "https://api.elevenlabs.io/v1/speech-to-text",
                    files=files,
                    data=data,
                    headers=headers,
                )
                logger.info(f"[STT API] status={response.status_code} body={response.text[:500]}")
                if response.status_code == 200:
                    return response.json().get("text", "")
                else:
                    logger.error(f"STT error: {response.status_code} {response.text[:200]}")
                    return None
        except Exception as e:
            logger.error(f"STT HTTP error: {e}")
            return None

    def get_available(self) -> bool:
        return self.client is not None


elevenlabs_service = ElevenLabsService()
