import os
import io
import logging
from typing import Optional
from dotenv import load_dotenv
from elevenlabs import ElevenLabs, VoiceSettings
import httpx

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)


class ElevenLabsService:
    def __init__(self):
        self.api_key = os.getenv("ELEVENLABS_API_KEY", "")
        if not self.api_key:
            logger.error("ELEVENLABS_API_KEY not set")
            self.client = None
        else:
            self.client = ElevenLabs(api_key=self.api_key)
            logger.info("ElevenLabs client initialized")

    async def text_to_speech(self, text: str, voice_id: str, voice_settings: Optional[dict] = None) -> Optional[bytes]:
        """Convert text to speech using ElevenLabs TTS API."""
        if not self.client:
            logger.error("ElevenLabs client not available")
            return None
        try:
            logger.info(f"TTS request: voice={voice_id[:8]}... text={text[:50]}...")
            audio = self.client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id="eleven_flash_v2_5",
                output_format="mp3_44100_128",
                voice_settings=VoiceSettings(**voice_settings) if voice_settings else None,
            )
            audio_bytes = b"".join(audio)
            logger.info(f"TTS success: {len(audio_bytes)} bytes")
            return audio_bytes
        except Exception as e:
            logger.error(f"TTS error: {e}")
            return None

    async def speech_to_text(self, audio_bytes: bytes, content_type: str = "audio/webm") -> Optional[str]:
        """Transcribe audio using ElevenLabs STT API.
        
        Per docs: supports all major audio formats.
        Using scribe_v1 model for reliable transcription.
        """
        if not self.api_key:
            return None
        try:
            logger.info(f"STT request: {len(audio_bytes)} bytes")
            async with httpx.AsyncClient(timeout=30.0) as client:
                files = {
                    "file": ("audio.webm", io.BytesIO(audio_bytes), content_type or "audio/webm"),
                }
                data = {"model_id": "scribe_v1", "language_code": "eng"}
                headers = {"xi-api-key": self.api_key}
                response = await client.post(
                    "https://api.elevenlabs.io/v1/speech-to-text",
                    files=files,
                    data=data,
                    headers=headers,
                )
                if response.status_code == 200:
                    result = response.json()
                    text = result.get("text", "")
                    logger.info(f"STT success: '{text[:100]}...'")
                    return text
                else:
                    logger.error(f"STT error {response.status_code}: {response.text[:300]}")
                    return None
        except Exception as e:
            logger.error(f"STT HTTP error: {e}")
            return None

    async def sound_effect(self, text: str, duration_seconds: float = 0.5) -> Optional[bytes]:
        """Generate a short sound effect with ElevenLabs."""
        if not self.api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(
                    "https://api.elevenlabs.io/v1/sound-generation",
                    json={
                        "text": text,
                        "duration_seconds": max(0.5, duration_seconds),
                        "prompt_influence": 0.35,
                    },
                    headers={
                        "xi-api-key": self.api_key,
                        "Accept": "audio/mpeg",
                        "Content-Type": "application/json",
                    },
                )
                if response.status_code == 200:
                    logger.info(f"SFX success: {len(response.content)} bytes")
                    return response.content
                logger.error(f"SFX error {response.status_code}: {response.text[:300]}")
                return None
        except Exception as e:
            logger.error(f"SFX HTTP error: {e}")
            return None

    def get_available(self) -> bool:
        return self.client is not None


elevenlabs_service = ElevenLabsService()
