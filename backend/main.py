import json
import random
import base64
import logging
import time
import re
import os
import uuid
import unicodedata
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel

from models import SessionCreate, ThemeType, HecklerType, HECKLER_CONFIG, HeckleEvent
from services.session_service import (
    create_session, get_session, update_session_status,
    add_transcript_segment, add_heckle, get_recent_heckles,
)
from services.llm_service import llm_service
from services.elevenlabs_service import elevenlabs_service

THEME_ANNOUNCERS = {
    ThemeType.PRODUCT_LAUNCH: ("21m00Tcm4TlvDq8ikWAM", "Tech conference announcer"),
    ThemeType.CORPORATE: ("21m00Tcm4TlvDq8ikWAM", "Boardroom host"),
    ThemeType.STANDUP: ("21m00Tcm4TlvDq8ikWAM", "Comedy club MC"),
    ThemeType.STAGE_SHOW: ("21m00Tcm4TlvDq8ikWAM", "Theater host"),
}

WELCOME_TEMPLATES = {
    ThemeType.PRODUCT_LAUNCH: "Please welcome {name} to the stage! They're here to talk about {topic}. Let's see if the crowd goes easy on them!",
    ThemeType.CORPORATE: "Next on the agenda, please welcome {name}! They'll be presenting on {topic}. Try not to fall asleep everyone!",
    ThemeType.STANDUP: "Alright folks, give it up for {name}! They're going to talk about {topic}. Let's see if they're actually funny!",
    ThemeType.STAGE_SHOW: "And now, the moment you've all been waiting for... please welcome {name}! They're performing about {topic}. Good luck up there!",
}

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
logger = logging.getLogger(__name__)

MAX_WS_AUDIO_BYTES = int(os.getenv("MAX_WS_AUDIO_BYTES", "1200000"))
MAX_WS_TEXT_BYTES = int(os.getenv("MAX_WS_TEXT_BYTES", "20000"))
MAX_TRANSCRIPT_BUFFER_CHARS = int(os.getenv("MAX_TRANSCRIPT_BUFFER_CHARS", "1400"))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3005,http://127.0.0.1:3005").split(",")
    if origin.strip()
]
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]

NOISE_TRANSCRIPT_RE = re.compile(
    r"[\(\[][^)\]]*(mechanical|sound|sounds|noise|music|pause|video|playing|ringtone|llamada|tono|silence|click|beep|static)[^)\]]*[\)\]]",
    re.IGNORECASE,
)

NOISE_WORDS_RE = re.compile(
    r"\b(mechanical sounds?|white noise|melodic music|techno music|video playing|three seconds pause|ringtone|tono de llamada|background music|different microphone|can you(?: guys| all| folks| everyone)? hear me|can everyone hear me|mic check|testing testing|is this thing on|hello hello|mm-?hmm)\b",
    re.IGNORECASE,
)

MIC_CHECK_RE = re.compile(
    r"\b(hello everyone|hi everyone|hey everyone)?\s*(can you(?: guys| all| folks| everyone)? hear me|can everyone hear me|mic check|testing(?:,?\s*testing)?|is this thing on)\b",
    re.IGNORECASE,
)


def _latin_text_ratio(text: str) -> float:
    letters = [char for char in text if char.isalpha()]
    if not letters:
        return 0.0
    latin_letters = 0
    for char in letters:
        try:
            if "LATIN" in unicodedata.name(char):
                latin_letters += 1
        except ValueError:
            continue
    return latin_letters / len(letters)


def _speech_words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z][A-Za-z'-]{1,}", text)


def is_user_speech(text: str) -> bool:
    cleaned = text.strip()
    if len(cleaned) < 8:
        return False
    if NOISE_TRANSCRIPT_RE.search(cleaned) or NOISE_WORDS_RE.search(cleaned) or MIC_CHECK_RE.search(cleaned):
        return False
    if _latin_text_ratio(cleaned) < 0.72:
        return False
    words = _speech_words(cleaned)
    if len(words) < 3:
        return False
    return True


def is_heckle_worthy(text: str) -> bool:
    if MIC_CHECK_RE.search(text):
        return False
    words = _speech_words(text)
    if len(words) < 8:
        return False
    if len(set(word.lower() for word in words)) < 6:
        return False
    if len(text.strip()) < 42:
        return False
    return True

app = FastAPI(title="Stage Fear - Heckler Backend")

if ALLOWED_HOSTS:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validate_session_id(session_id: str) -> str:
    try:
        return str(uuid.UUID(session_id))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid session id")


async def _close_bad_websocket(websocket: WebSocket, message: str) -> None:
    await websocket.send_json({"type": "error", "message": message})
    await websocket.close(code=1008)


class SessionResponse(BaseModel):
    session_id: str
    topic: str
    theme: str
    intensity: int
    status: str
    crowd_work: Optional[list] = None


@app.post("/api/sessions", response_model=SessionResponse)
async def create_new_session(data: SessionCreate):
    session = await create_session(data)
    crowd_work = await llm_service.generate_crowd_work(data.topic, data.theme.value)
    return SessionResponse(
        session_id=session.id,
        topic=session.topic,
        theme=session.theme.value,
        intensity=session.intensity,
        status=session.status,
        crowd_work=crowd_work,
    )


@app.get("/api/sessions/{session_id}")
async def get_session_info(session_id: str):
    session_id = _validate_session_id(session_id)
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/api/sessions/{session_id}/start-stage")
async def start_stage(session_id: str):
    session_id = _validate_session_id(session_id)
    await update_session_status(session_id, "on_stage")
    return {"status": "on_stage"}


@app.get("/api/sessions/{session_id}/welcome")
async def get_welcome_audio(session_id: str):
    session_id = _validate_session_id(session_id)
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    theme = session.theme
    topic = session.topic
    voice_id, _ = THEME_ANNOUNCERS.get(theme, THEME_ANNOUNCERS[ThemeType.PRODUCT_LAUNCH])
    template = WELCOME_TEMPLATES.get(theme, WELCOME_TEMPLATES[ThemeType.PRODUCT_LAUNCH])
    welcome_text = template.replace("{topic}", topic).replace("{name}", getattr(session, 'name', 'our speaker'))

    audio = await elevenlabs_service.text_to_speech(welcome_text, voice_id)
    result = {"text": welcome_text}
    if audio:
        result["audio"] = base64.b64encode(audio).decode()
    return result


@app.get("/api/health")
async def health():
    has_eleven = elevenlabs_service.get_available()
    return {"status": "ok", "elevenlabs": "connected" if has_eleven else "no_api_key"}


@app.websocket("/ws/{session_id}")
async def stage_websocket(websocket: WebSocket, session_id: str):
    try:
        session_id = str(uuid.UUID(session_id))
    except (ValueError, TypeError):
        await websocket.accept()
        await _close_bad_websocket(websocket, "Invalid session id")
        return

    await websocket.accept()
    logger.info(f"WebSocket connected for session {session_id}")

    session = await get_session(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    personas = list(HecklerType)
    last_heckle_time = time.time() - 999
    last_silence_heckle_time = time.time() - 999
    segment_buffer = ""
    heckle_count = 0
    recent_personas: list[HecklerType] = []

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "audio_chunk":
                audio_b64 = data.get("audio", "")
                if not isinstance(audio_b64, str) or not audio_b64:
                    continue
                if len(audio_b64) > MAX_WS_AUDIO_BYTES * 2:
                    await _close_bad_websocket(websocket, "Audio chunk too large")
                    return

                try:
                    audio_bytes = base64.b64decode(audio_b64, validate=True)
                except Exception:
                    await _close_bad_websocket(websocket, "Invalid audio payload")
                    return
                if len(audio_bytes) > MAX_WS_AUDIO_BYTES:
                    await _close_bad_websocket(websocket, "Audio chunk too large")
                    return
                mime_type = data.get("mime_type", "audio/webm")
                if mime_type not in {"audio/webm", "audio/webm;codecs=opus", "audio/mp4", "audio/mpeg", "audio/wav"}:
                    mime_type = "audio/webm"
                logger.info(f"Received audio chunk: {len(audio_bytes)} bytes")
                transcript = await elevenlabs_service.speech_to_text(audio_bytes, mime_type)

                if transcript and len(transcript.strip()) > 2:
                    transcript_text = transcript.strip()
                    if not is_user_speech(transcript_text):
                        logger.info(f"Ignored non-speech STT: '{transcript_text}'")
                        continue

                    segment_buffer = (segment_buffer + " " + transcript_text)[-MAX_TRANSCRIPT_BUFFER_CHARS:]
                    logger.info(f"Transcript: '{transcript_text}' | Buffer: {len(_speech_words(segment_buffer))} words")

                    await websocket.send_json({
                        "type": "transcript",
                        "text": transcript_text,
                    })

                    word_count = len(_speech_words(segment_buffer))
                    if is_heckle_worthy(segment_buffer):
                        await add_transcript_segment(session_id, segment_buffer.strip())

                        intensity = session.intensity
                        cooldown = max(0.8, 4.0 - intensity * 0.55)

                        now = time.time()
                        should_heckle = (now - last_heckle_time > cooldown)

                        logger.info(f"Heckle check: words={word_count} intensity={intensity} cooldown={cooldown:.1f}s elapsed={now-last_heckle_time:.1f}s should_heckle={should_heckle}")

                        if should_heckle:
                            last_heckle_time = now
                            heckle_count += 1

                            recent = await get_recent_heckles(session_id, 5)
                            heckle_event = await llm_service.generate_heckle_event(
                                transcript_segment=segment_buffer.strip(),
                                previous_heckles=recent,
                                topic=session.topic,
                                first_heckle=heckle_count == 1,
                            )
                            persona = HecklerType(heckle_event.get("persona", HecklerType.CLASSIC_HECKLER.value))
                            config = HECKLER_CONFIG[persona]
                            heckle_text = heckle_event.get("text")

                            if heckle_text:
                                reaction = heckle_event.get("reaction", "laugh")
                                logger.info(f"Generating TTS for heckle: {heckle_text}")
                                audio_bytes_out = await elevenlabs_service.text_to_speech(
                                    text=heckle_text,
                                    voice_id=config["voice_id"],
                                    voice_settings=config.get("voice_settings"),
                                )
                                audio_b64_out = None
                                if audio_bytes_out:
                                    audio_b64_out = base64.b64encode(audio_bytes_out).decode()
                                    logger.info(f"TTS generated: {len(audio_bytes_out)} bytes")

                                position = random.randint(0, 23)
                                heckle = HeckleEvent(
                                    persona=persona,
                                    text=heckle_text,
                                    audio_url=audio_b64_out,
                                    position=position,
                                    tone=config["tone"],
                                )
                                await add_heckle(session_id, heckle)

                                await websocket.send_json({
                                    "type": "heckle",
                                    "persona": persona.value,
                                    "text": heckle_text,
                                    "audio": audio_b64_out,
                                    "position": position,
                                    "tone": config["tone"],
                                    "reaction": reaction,
                                })
                                recent_personas.append(persona)
                                recent_personas = recent_personas[-4:]
                                logger.info(f"Heckle #{heckle_count} sent: {persona.value} - {heckle_text}")

                        segment_buffer = ""

            elif data.get("type") == "silence_prompt":
                now = time.time()
                intensity = session.intensity
                silence_cooldown = max(7.0, 13.0 - intensity)
                if now - last_heckle_time < 3.5 or now - last_silence_heckle_time < silence_cooldown:
                    continue

                last_silence_heckle_time = now
                last_heckle_time = now
                heckle_count += 1
                recent = await get_recent_heckles(session_id, 5)
                try:
                    silent_for = max(0, min(60, float(data.get("silent_for", 0) or 0)))
                except (TypeError, ValueError):
                    silent_for = 0
                prompt = (
                    f"The speaker is on stage for '{session.topic}' but has been silent for "
                    f"{silent_for:.0f} seconds. Heckle the awkward pause, stage nerves, or lost momentum."
                )
                heckle_event = await llm_service.generate_heckle_event(
                    transcript_segment=prompt,
                    previous_heckles=recent,
                    topic=session.topic,
                    first_heckle=False,
                )
                persona = HecklerType(heckle_event.get("persona", HecklerType.CLASSIC_HECKLER.value))
                config = HECKLER_CONFIG[persona]
                heckle_text = heckle_event.get("text")

                if heckle_text:
                    reaction = heckle_event.get("reaction", "murmur")
                    audio_bytes_out = await elevenlabs_service.text_to_speech(
                        text=heckle_text,
                        voice_id=config["voice_id"],
                        voice_settings=config.get("voice_settings"),
                    )
                    audio_b64_out = base64.b64encode(audio_bytes_out).decode() if audio_bytes_out else None
                    position = random.randint(0, 23)
                    heckle = HeckleEvent(
                        persona=persona,
                        text=heckle_text,
                        audio_url=audio_b64_out,
                        position=position,
                        tone=config["tone"],
                    )
                    await add_heckle(session_id, heckle)
                    await websocket.send_json({
                        "type": "heckle",
                        "persona": persona.value,
                        "text": heckle_text,
                        "audio": audio_b64_out,
                        "position": position,
                        "tone": config["tone"],
                        "reaction": reaction,
                    })

            elif data.get("type") == "end_session":
                await update_session_status(session_id, "ended")
                await websocket.send_json({"type": "session_ended"})
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
