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
        first_heckle: bool = False,
    ) -> Optional[str]:
        """Generate an intelligent heckle based on what the speaker just said."""
        config = HECKLER_CONFIG[persona_type]
        recent = "\n".join(previous_heckles[-5:]) if previous_heckles else "(none yet)"
        first_rule = """
This is the FIRST heckle of the session. It must directly reference the product/topic and the speaker's concrete pitch.
If the topic is finance, crypto, AI, marketing, healthcare, education, or another domain, make the joke about that domain.
Example only: for a finance crypto app, "Oh great, another crypto wallet with trust issues."
Do not use generic lines like "that doesn't add up" or "get to the point."
""" if first_heckle else """
Every heckle must react to the latest concrete point. Avoid generic filler and do not heckle greetings, mic checks, or silence.
"""

        system_prompt = f"""{config['prompt']}

Context:
- Topic of talk: {topic}
- Recent heckles from others (do NOT repeat these): {recent}
- Timing rule: {first_rule}

Rules:
- Reference at least one concrete noun from the topic or the speaker's latest line.
- Keep it under 14 words.
- Make it useful public-speaking pressure, not random abuse.

Respond with ONLY the heckle text, nothing else. No quotes, no explanations."""

        user_prompt = f"""The speaker just said: "{transcript_segment}"

Generate your heckle now:"""

        if not self.client:
            return self._fallback_heckle(transcript_segment, persona_type, topic, first_heckle)

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
                generic = (
                    "doesn't add up" in heckle.lower()
                    or "that doesn't" in heckle.lower()
                    or "get to the point" in heckle.lower()
                    or "what's your evidence" in heckle.lower()
                )
                if first_heckle and generic:
                    return self._fallback_heckle(transcript_segment, persona_type, topic, first_heckle)
                logger.info(f"LLM heckle ({persona_type.value}): {heckle}")
                return heckle
            return self._fallback_heckle(transcript_segment, persona_type, topic, first_heckle)
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return self._fallback_heckle(transcript_segment, persona_type, topic, first_heckle)

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

    def _fallback_heckle(self, transcript: str, persona: HecklerType, topic: str = "", first_heckle: bool = False) -> str:
        """Fallback heckles when LLM is unavailable."""
        topic_words = [word for word in topic.split() if len(word) > 3]
        target = " ".join(topic_words[:3]) if topic_words else "that product"
        lower = f"{topic} {transcript}".lower()
        if first_heckle:
            if "crypto" in lower:
                return "Oh great, another crypto app asking us to trust it."
            if "finance" in lower or "fintech" in lower:
                return "So your finance app fixes money by adding another app?"
            if "ai" in lower:
                return "Let me guess, AI that does everyone's job except yours?"
            return f"So {target} is the big breakthrough we're betting on?"

        fallbacks = {
            HecklerType.SKEPTIC: [
                f"But how do you prove {target} actually works?",
                f"What's the evidence behind {target}?",
                "Are you sure about that?",
                "What assumption are we supposed to accept there?",
                "Have you considered the opposite?",
            ],
            HecklerType.TEEN: [
                f"{target} sounds like three apps in a trench coat.",
                "Cool story, but where's the actual point?",
                f"I've seen {target} on Product Hunt already.",
                "Can we skip to the end?",
                "My phone is more interesting.",
            ],
            HecklerType.KNOW_IT_ALL: [
                f"Actually, {target} has a much harder adoption problem.",
                "Technically, that market is already crowded.",
                "I read the opposite in a paper.",
                "Let me correct you on that.",
                "The real answer is different.",
            ],
            HecklerType.CLASSIC_HECKLER: [
                f"{target} better have a punchline!",
                "That pitch needs a seatbelt!",
                "My grandmother has a clearer roadmap!",
                "Is this a product launch or a trailer?",
                "Someone get this pitch some traction!",
            ],
            HecklerType.NERVOUS: [
                "Are you okay up there?",
                f"I'm nervous for {target} already.",
                "My hands are sweating for you.",
                "I could never do this.",
                "Take a deep breath!",
            ],
            HecklerType.CRITIC: [
                f"The weak point is {target}'s actual differentiation.",
                "You're missing the adoption risk.",
                "That argument needs numbers behind it.",
                "Let's separate the feature from the business.",
                "The data burden is doing heavy lifting there.",
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
