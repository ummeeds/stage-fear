import os
import json
import logging
from typing import Optional
from openai import AsyncOpenAI
from models import HecklerType, HECKLER_CONFIG

logger = logging.getLogger(__name__)


class LLMService:
    def __init__(self):
        api_key = os.getenv("OPENROUTER_API_KEY", "")
        base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        self.model = os.getenv("LLM_MODEL", "moonshotai/kimi-k2.6")
        if api_key:
            self.client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
                default_headers={
                    "HTTP-Referer": "https://stage-fear.app",
                    "X-Title": "Stage Fear - ElevenHacks",
                }
            )
            logger.info(f"LLM client initialized with model: {self.model}")
        else:
            self.client = None
            logger.warning("OPENROUTER_API_KEY not set")

    async def generate_heckle(
        self,
        transcript_segment: str,
        previous_heckles: list[str],
        persona_type: HecklerType,
        topic: str,
    ) -> Optional[str]:
        """Generate an intelligent heckle based on what the speaker just said."""
        config = HECKLER_CONFIG[persona_type]
        recent = "\n".join(previous_heckles[-5:]) if previous_heckles else "(none yet)"

        system_prompt = f"""{config['prompt']}

Context:
- Topic of talk: {topic}
- Recent heckles from others (do NOT repeat these): {recent}

Respond with ONLY the heckle text, nothing else. No quotes, no explanations."""

        user_prompt = f"""The speaker just said: "{transcript_segment}"

Generate your heckle now:"""

        if not self.client:
            return self._fallback_heckle(transcript_segment, persona_type)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=60,
                temperature=0.9,
            )
            content = response.choices[0].message.content
            if content:
                heckle = content.strip().strip('"').strip()
                logger.info(f"LLM heckle ({persona_type.value}): {heckle}")
                return heckle
            return self._fallback_heckle(transcript_segment, persona_type)
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return self._fallback_heckle(transcript_segment, persona_type)

    async def generate_crowd_work(self, topic: str, theme: str) -> list[str]:
        """Generate pre-stage crowd reactions."""
        if not self.client:
            return self._fallback_crowd_work(topic)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": """You are a rowdy but fun crowd at a live event.
Generate 3 crowd reactions before someone goes on stage.
1. A hyped supporter shouting encouragement
2. A skeptic making a funny prediction
3. A random funny observation about the topic
Keep each under 15 words. Return as JSON array: ["reaction1", "reaction2", "reaction3"]"""},
                    {"role": "user", "content": f"Topic: {topic}\nTheme: {theme}"},
                ],
                max_tokens=150,
                temperature=0.9,
            )
            content = response.choices[0].message.content
            if content:
                try:
                    return json.loads(content.strip())
                except json.JSONDecodeError:
                    lines = [l.strip().strip('"') for l in content.strip("[]").split('","')]
                    return lines[:3] if lines else self._fallback_crowd_work(topic)
            return self._fallback_crowd_work(topic)
        except Exception as e:
            logger.error(f"LLM crowd work error: {e}")
            return self._fallback_crowd_work(topic)

    def _fallback_heckle(self, transcript: str, persona: HecklerType) -> str:
        """Fallback heckles when LLM is unavailable."""
        fallbacks = {
            HecklerType.SKEPTIC: [
                "But how do you actually know that?",
                "What's your evidence for that claim?",
                "Are you sure about that?",
                "That doesn't add up logically.",
                "Have you considered the opposite?",
            ],
            HecklerType.TEEN: [
                "This is so mid...",
                "Cool story, bro.",
                "I've heard this before.",
                "Can we skip to the end?",
                "My phone is more interesting.",
            ],
            HecklerType.KNOW_IT_ALL: [
                "Actually, that's not quite right.",
                "Technically speaking, you're wrong.",
                "I read the opposite in a paper.",
                "Let me correct you on that.",
                "The real answer is different.",
            ],
            HecklerType.CLASSIC_HECKLER: [
                "We've been here all day!",
                "Get to the point!",
                "My grandmother talks faster!",
                "Is this a TED talk or a nap?",
                "Someone get this person water!",
            ],
            HecklerType.NERVOUS: [
                "Are you okay up there?",
                "You seem really nervous.",
                "My hands are sweating for you.",
                "I could never do this.",
                "Take a deep breath!",
            ],
            HecklerType.CRITIC: [
                "Your premise is flawed.",
                "You're missing the key point.",
                "That argument doesn't hold up.",
                "Let's break down the logic here.",
                "The data doesn't support that.",
            ],
        }
        import random
        return random.choice(fallbacks.get(persona, fallbacks[HecklerType.CLASSIC_HECKLER]))

    def _fallback_crowd_work(self, topic: str) -> list[str]:
        return [
            f"Let's go! Tell us about {topic.split()[-1] if topic.split() else 'it'}!",
            "I bet this is another 'disrupting the industry' pitch...",
            f"Hope this is better than the last talk about {topic[:20]}!",
        ]


llm_service = LLMService()
