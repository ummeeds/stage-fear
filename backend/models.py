from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class ThemeType(str, Enum):
    PRODUCT_LAUNCH = "product_launch"
    CORPORATE = "corporate"
    STANDUP = "standup"
    STAGE_SHOW = "stage_show"


class HecklerPersona(str, Enum):
    SKEPTIC = "skeptic"
    JEALOUS = "jealous"
    DRUNK = "drunk"
    CRITIC = "critic"
    JOKER = "joker"
    BOOMER = "boomer"
    TECH_BRO = "tech_bro"
    SARCASM = "sarcasm"


import os
DEFAULT_VOICE = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

PERSONA_CONFIG = {
    HecklerPersona.SKEPTIC: {
        "voice_id": DEFAULT_VOICE,
        "tone": "skeptical",
        "style": "questioning everything with heavy doubt and disbelief"
    },
    HecklerPersona.JEALOUS: {
        "voice_id": DEFAULT_VOICE,
        "tone": "jealous",
        "style": "bitter and envious about others' success, petty tone"
    },
    HecklerPersona.DRUNK: {
        "voice_id": DEFAULT_VOICE,
        "tone": "drunken",
        "style": "slurring and incoherent but somehow funny, chaotic energy"
    },
    HecklerPersona.CRITIC: {
        "voice_id": DEFAULT_VOICE,
        "tone": "harsh critic",
        "style": "brutally honest, nitpicking every single detail mercilessly"
    },
    HecklerPersona.JOKER: {
        "voice_id": DEFAULT_VOICE,
        "tone": "playful joker",
        "style": "making terrible puns and dad jokes about the topic"
    },
    HecklerPersona.BOOMER: {
        "voice_id": DEFAULT_VOICE,
        "tone": "confused boomer",
        "style": "doesn't understand anything modern, compares everything to 'back in my day'"
    },
    HecklerPersona.TECH_BRO: {
        "voice_id": DEFAULT_VOICE,
        "tone": "dismissive tech bro",
        "style": "everything is 'just build it bro', mentions web3 and AI ironically"
    },
    HecklerPersona.SARCASM: {
        "voice_id": DEFAULT_VOICE,
        "tone": "sarcastic",
        "style": "dripping with heavy sarcasm, slow clap energy, eye-roll vibes"
    },
}


class SessionCreate(BaseModel):
    topic: str
    theme: ThemeType
    intensity: int  # 1-5


class CrowdWorkRequest(BaseModel):
    session_id: str
    user_transcript: str


class HeckleEvent(BaseModel):
    persona: HecklerPersona
    text: str
    audio_url: Optional[str] = None
    position: int  # seat position in crowd


class SessionState(BaseModel):
    id: str
    topic: str
    theme: ThemeType
    intensity: int
    transcript: List[str]
    heckles: List[HeckleEvent]
    created_at: datetime
    status: str  # "crowd_work" | "on_stage" | "ended"
