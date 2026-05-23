import json
import random
import base64
import logging
import time
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import SessionCreate, ThemeType, HecklerPersona, PERSONA_CONFIG, HeckleEvent
from services.session_service import (
    create_session, get_session, update_session_status,
    add_transcript_segment, add_heckle, get_recent_heckles,
)
from services.llm_service import llm_service
from services.elevenlabs_service import elevenlabs_service

import os as _os
_WELCOME_VOICE = _os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

THEME_ANNOUNCERS = {
    ThemeType.PRODUCT_LAUNCH: (_WELCOME_VOICE, "Tech conference announcer"),
    ThemeType.CORPORATE: (_WELCOME_VOICE, "Boardroom host"),
    ThemeType.STANDUP: (_WELCOME_VOICE, "Comedy club MC"),
    ThemeType.STAGE_SHOW: (_WELCOME_VOICE, "Theater host"),
}

WELCOME_TEMPLATES = {
    ThemeType.PRODUCT_LAUNCH: "Please welcome to the stage... our next presenter! They're here to talk about {topic}. Let's see if the crowd goes easy on them!",
    ThemeType.CORPORATE: "Next on the agenda... {topic}. Please give your attention to the presenter. And try not to fall asleep!",
    ThemeType.STANDUP: "Alright folks, give it up for our next comedian! They're going to talk about {topic}. Let's see if they're actually funny!",
    ThemeType.STAGE_SHOW: "And now, for the performance you've all been waiting for... {topic}! Take the stage and good luck!",
}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Stage Fear - Heckler Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/api/sessions/{session_id}/start-stage")
async def start_stage(session_id: str):
    await update_session_status(session_id, "on_stage")
    return {"status": "on_stage"}


@app.get("/api/sessions/{session_id}/welcome")
async def get_welcome_audio(session_id: str):
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    theme = session.theme
    topic = session.topic
    voice_id, _ = THEME_ANNOUNCERS.get(theme, THEME_ANNOUNCERS[ThemeType.PRODUCT_LAUNCH])
    template = WELCOME_TEMPLATES.get(theme, WELCOME_TEMPLATES[ThemeType.PRODUCT_LAUNCH])
    welcome_text = template.replace("{topic}", topic)

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
    await websocket.accept()
    logger.info(f"WebSocket connected for session {session_id}")

    session = await get_session(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    personas = list(HecklerPersona)
    last_heckle_time = time.time()
    segment_buffer = ""

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "audio_chunk":
                audio_b64 = data.get("audio", "")
                if not audio_b64:
                    continue

                audio_bytes = base64.b64decode(audio_b64)
                transcript = await elevenlabs_service.speech_to_text(audio_bytes)

                if transcript and len(transcript.strip()) > 2:
                    segment_buffer += " " + transcript.strip()

                    await websocket.send_json({
                        "type": "transcript",
                        "text": transcript.strip(),
                    })

                    if len(segment_buffer.split()) >= 8:
                        await add_transcript_segment(session_id, segment_buffer.strip())

                        intensity = session.intensity
                        heckle_chance = intensity / 5.0
                        cooldown = max(1.5, 8.0 - intensity)

                        now = time.time()
                        if now - last_heckle_time > cooldown and random.random() < heckle_chance * 0.4:
                            last_heckle_time = now

                            persona = random.choice(personas)
                            config = PERSONA_CONFIG[persona]
                            recent = await get_recent_heckles(session_id, 5)

                            heckle_text = await llm_service.generate_heckle(
                                transcript_segment=segment_buffer.strip(),
                                previous_heckles=recent,
                                persona_tone=config["tone"],
                                persona_style=config["style"],
                                topic=session.topic,
                            )

                            if heckle_text:
                                audio_bytes_out = await elevenlabs_service.text_to_speech(
                                    text=heckle_text,
                                    voice_id=config["voice_id"],
                                )
                                audio_b64_out = None
                                if audio_bytes_out:
                                    audio_b64_out = base64.b64encode(audio_bytes_out).decode()
                                    logger.info(f"TTS audio generated: {len(audio_bytes_out)} bytes")

                                position = random.randint(0, 20)
                                heckle = HeckleEvent(
                                    persona=persona,
                                    text=heckle_text,
                                    audio_url=audio_b64_out,
                                    position=position,
                                )
                                await add_heckle(session_id, heckle)

                                await websocket.send_json({
                                    "type": "heckle",
                                    "persona": persona.value,
                                    "text": heckle_text,
                                    "audio": audio_b64_out,
                                    "position": position,
                                    "tone": config["tone"],
                                })

                        segment_buffer = ""

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
