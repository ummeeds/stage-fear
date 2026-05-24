import json
import random
import base64
import logging
import time
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import SessionCreate, ThemeType, HecklerType, HECKLER_CONFIG, HeckleEvent
from services.session_service import (
    create_session, get_session, update_session_status,
    add_transcript_segment, add_heckle, get_recent_heckles,
)
from services.llm_service import llm_service
from services.elevenlabs_service import elevenlabs_service

import os as _os

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
    await websocket.accept()
    logger.info(f"WebSocket connected for session {session_id}")

    session = await get_session(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    personas = list(HecklerType)
    last_heckle_time = time.time()
    segment_buffer = ""
    heckle_count = 0

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "audio_chunk":
                audio_b64 = data.get("audio", "")
                if not audio_b64:
                    continue

                audio_bytes = base64.b64decode(audio_b64)
                logger.info(f"Received audio chunk: {len(audio_bytes)} bytes")
                transcript = await elevenlabs_service.speech_to_text(audio_bytes)

                if transcript and len(transcript.strip()) > 2:
                    segment_buffer += " " + transcript.strip()
                    logger.info(f"Transcript: '{transcript.strip()}' | Buffer: {len(segment_buffer.split())} words")

                    await websocket.send_json({
                        "type": "transcript",
                        "text": transcript.strip(),
                    })

                    word_count = len(segment_buffer.split())
                    if word_count >= 5:
                        await add_transcript_segment(session_id, segment_buffer.strip())

                        intensity = session.intensity
                        heckle_chance = intensity / 5.0
                        cooldown = max(1.0, 5.0 - intensity * 0.6)

                        now = time.time()
                        should_heckle = (now - last_heckle_time > cooldown)

                        logger.info(f"Heckle check: words={word_count} intensity={intensity} chance={heckle_chance*0.7:.2f} cooldown={cooldown:.1f}s elapsed={now-last_heckle_time:.1f}s should_heckle={should_heckle}")

                        if should_heckle:
                            last_heckle_time = now
                            heckle_count += 1

                            persona = random.choice(personas)
                            config = HECKLER_CONFIG[persona]
                            recent = await get_recent_heckles(session_id, 5)

                            heckle_text = await llm_service.generate_heckle(
                                transcript_segment=segment_buffer.strip(),
                                previous_heckles=recent,
                                persona_type=persona,
                                topic=session.topic,
                            )

                            if heckle_text:
                                logger.info(f"Generating TTS for heckle: {heckle_text}")
                                audio_bytes_out = await elevenlabs_service.text_to_speech(
                                    text=heckle_text,
                                    voice_id=config["voice_id"],
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
                                })
                                logger.info(f"Heckle #{heckle_count} sent: {persona.value} - {heckle_text}")

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
