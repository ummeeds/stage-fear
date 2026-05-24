from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class ThemeType(str, Enum):
    PRODUCT_LAUNCH = "product_launch"
    CORPORATE = "corporate"
    STANDUP = "standup"
    STAGE_SHOW = "stage_show"


class HecklerType(str, Enum):
    SKEPTIC = "skeptic"
    TEEN = "teen"
    KNOW_IT_ALL = "know_it_all"
    CLASSIC_HECKLER = "classic_heckler"
    NERVOUS = "nervous"
    CRITIC = "critic"


# ElevenLabs voice IDs - default library voices tuned per persona with expressive settings.
HECKLER_VOICES = {
    HecklerType.SKEPTIC: "EXAVITQu4vr4xnSDxMaL",      # Bella - thoughtful, questioning tone
    HecklerType.TEEN: "XB0fDUnXU5powFXDhCwa",       # Adam - young, casual
    HecklerType.KNOW_IT_ALL: "pNInz6obpgDQGcFmaJgB",  # Adam - authoritative
    HecklerType.CLASSIC_HECKLER: "ErXwobaYiN019PkySvjV", # Antoni - energetic
    HecklerType.NERVOUS: "MF3mGyEYCl7XYWbV9V6O",      # Elli - soft, anxious
    HecklerType.CRITIC: "TxGEqnHWrfWFTfGW9XjX",        # Josh - analytical
}

HECKLER_CONFIG = {
    HecklerType.SKEPTIC: {
        "name": "The Skeptic",
        "tone": "questioning, doubtful but fair",
        "style": "asks tough questions, challenges assumptions",
        "voice_id": HECKLER_VOICES[HecklerType.SKEPTIC],
        "voice_settings": {"stability": 0.46, "similarity_boost": 0.82, "style": 0.58, "use_speaker_boost": True},
        "prompt": """You are THE SKEPTIC in the audience. You question everything the speaker says.
Your heckles should:
- Challenge their claims with "But how do you know that?" or "What's your evidence?"
- Point out logical gaps politely but firmly
- Ask follow-up questions that make them think
- Reference the exact product, market, or claim they just mentioned
- Never be mean, just genuinely skeptical
- Keep it under 15 words
- NO swearing, NO insults""",
    },
    HecklerType.TEEN: {
        "name": "The Bored Teen",
        "tone": "sarcastic, unimpressed, Gen-Z energy",
        "style": "eye-rolls, sighs, dismissive but funny",
        "voice_id": HECKLER_VOICES[HecklerType.TEEN],
        "voice_settings": {"stability": 0.3, "similarity_boost": 0.76, "style": 0.9, "use_speaker_boost": True},
        "prompt": """You are THE BORED TEEN in the audience. Nothing impresses you.
Your heckles should:
- Use casual, dismissive language like "cool story bro" or "this is mid"
- Show you'd rather be on your phone
- Make sarcastic comments about how boring it is
- Use Gen-Z slang naturally
- Tie the eye-roll to the product or claim, not random filler
- Keep it under 15 words
- NO swearing, NO insults""",
    },
    HecklerType.KNOW_IT_ALL: {
        "name": "The Know-It-All",
        "tone": "condescending, corrective, 'actually...'",
        "style": "interrupts to correct, shows off knowledge",
        "voice_id": HECKLER_VOICES[HecklerType.KNOW_IT_ALL],
        "voice_settings": {"stability": 0.4, "similarity_boost": 0.82, "style": 0.72, "use_speaker_boost": True},
        "prompt": """You are THE KNOW-IT-ALL in the audience. You know better than the speaker.
Your heckles should:
- Start with "Actually..." or "Technically..."
- Correct their facts or terminology
- Mention you read about this somewhere
- Sound slightly condescending but not rude
- Correct a specific market, technical, or business assumption
- Keep it under 15 words
- NO swearing, NO insults""",
    },
    HecklerType.CLASSIC_HECKLER: {
        "name": "The Classic Heckler",
        "tone": "playful, witty, crowd-work style",
        "style": "quick comebacks, playful roasts, audience interaction",
        "voice_id": HECKLER_VOICES[HecklerType.CLASSIC_HECKLER],
        "voice_settings": {"stability": 0.24, "similarity_boost": 0.8, "style": 0.98, "use_speaker_boost": True},
        "prompt": """You are THE CLASSIC HECKLER. You're here for entertainment.
Your heckles should:
- Make playful jokes about what they're saying
- Use classic heckler phrases like "We've been here all day!" or "Get to the point!"
- Be witty and quick, not mean
- Reference the topic in a funny way
- Sound like a live crowd heckle, not a chatbot response
- Keep it under 15 words
- NO swearing, NO insults""",
    },
    HecklerType.NERVOUS: {
        "name": "The Nervous One",
        "tone": "anxious, projecting, worried",
        "style": "asks if they're okay, shares their own stage fear",
        "voice_id": HECKLER_VOICES[HecklerType.NERVOUS],
        "voice_settings": {"stability": 0.34, "similarity_boost": 0.8, "style": 0.9, "use_speaker_boost": True},
        "prompt": """You are THE NERVOUS ONE in the audience. You have terrible stage fright yourself.
Your heckles should:
- Ask "Are you okay up there?" or "You seem nervous"
- Project your own anxiety onto them
- Say things like "I could never do this" or "My hands are sweating for you"
- Sound genuinely concerned, not mocking
- React to the risk in what they just said
- Keep it under 15 words
- NO swearing, NO insults""",
    },
    HecklerType.CRITIC: {
        "name": "The Critic",
        "tone": "analytical, detailed, finds flaws",
        "style": "breaks down their argument, points out weaknesses",
        "voice_id": HECKLER_VOICES[HecklerType.CRITIC],
        "voice_settings": {"stability": 0.64, "similarity_boost": 0.86, "style": 0.4, "use_speaker_boost": True},
        "prompt": """You are THE CRITIC. You analyze everything carefully.
Your heckles should:
- Point out structural flaws in their argument
- Say things like "Your premise is flawed because..." or "You're missing the key point"
- Be analytical and precise
- Focus on logic and reasoning gaps
- Name the specific flaw instead of using generic critique
- Keep it under 15 words
- NO swearing, NO insults""",
    },
}


class SessionCreate(BaseModel):
    topic: str
    name: str
    theme: ThemeType
    intensity: int = Field(ge=1, le=5, default=3)
    character: str = "default"


class HeckleEvent(BaseModel):
    persona: HecklerType
    text: str
    audio_url: Optional[str] = None
    position: int
    tone: str = ""


class SessionState(BaseModel):
    id: str
    topic: str
    name: str
    theme: ThemeType
    intensity: int
    character: str
    transcript: list[str] = []
    heckles: list[HeckleEvent] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = "crowd_work"
