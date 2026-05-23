import os
import logging
from typing import Optional
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


HEKLER_SYSTEM_PROMPT = """You are a HECKLER in a live audience. The person on stage is speaking about a topic.
Your job: Generate ONE short, funny, biting heckle (15 words max) based on what they just said.

Rules:
- Be WITTY and SHARP, not mean-spirited
- Make it feel spontaneous and in-the-moment
- Reference specific things they mentioned
- Keep it under 15 words
- Vary your style based on what was said
- NO repetition of previous heckles

Respond with ONLY the heckle text, nothing else."""


CROWD_WORK_SYSTEM_PROMPT = """You are a rowdy but fun crowd at a live event. Someone is about to go on stage.
They've just told you what they plan to talk about.

Generate 3 crowd reactions that:
1. A hyped supporter shouting encouragement
2. A skeptic making a funny prediction about the talk
3. A random funny observation about the topic

Keep each under 15 words. Return as JSON array like: ["reaction1", "reaction2", "reaction3"]"""


class LLMService:
    def __init__(self):
        api_key = os.getenv("OPENROUTER_API_KEY", "")
        base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        self.model = os.getenv("LLM_MODEL", "moonshotai/kimi-k2-0905-preview")
        if api_key and "YOUR_" not in api_key:
            self.client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
                default_headers={
                    "HTTP-Referer": "https://stage-fear.app",
                    "X-Title": "Stage Fear - ElevenHacks",
                }
            )
        else:
            self.client = None
            logger.warning("OPENROUTER_API_KEY not set. Using fallback heckle mode.")

    async def generate_heckle(
        self,
        transcript_segment: str,
        previous_heckles: list[str],
        persona_tone: str,
        persona_style: str,
        topic: str,
    ) -> Optional[str]:
        if not self.client:
            return self._fallback_heckle(transcript_segment, topic)

        recent_heckles = "\n".join(previous_heckles[-5:]) if previous_heckles else "none"
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": HEKLER_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"""Topic of talk: {topic}
Persona tone: {persona_tone} ({persona_style})
They just said: "{transcript_segment}"
Recent heckles (do NOT repeat): {recent_heckles}

Generate ONE heckle now:""",
                    },
                ],
                max_tokens=50,
                temperature=0.9,
            )
            content = response.choices[0].message.content
            if not content:
                return self._fallback_heckle(transcript_segment, topic)
            return content.strip().strip('"')
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return self._fallback_heckle(transcript_segment, topic)

    async def generate_crowd_work(self, topic: str, theme: str) -> list[str]:
        if not self.client:
            return self._fallback_crowd_work(topic, theme)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": CROWD_WORK_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"Topic: {topic}\nTheme: {theme}\nGenerate 3 crowd reactions before the person goes on stage.",
                    },
                ],
                max_tokens=150,
                temperature=0.9,
            )
            import json
            content = response.choices[0].message.content
            if not content:
                logger.warning("LLM returned empty response, using fallback")
                return self._fallback_crowd_work(topic, theme)
            content = content.strip()
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                lines = [l.strip().strip('"') for l in content.strip("[]").split('","')]
                return lines[:3] if lines else self._fallback_crowd_work(topic, theme)
        except Exception as e:
            logger.error(f"LLM crowd work error: {e}")
            return self._fallback_crowd_work(topic, theme)

    def _fallback_heckle(self, transcript: str, topic: str) -> str:
        fallbacks = [
            "Oh wow, groundbreaking stuff right there!",
            "Is this a TED talk or a nap invitation?",
            "I could've learned this from a fortune cookie.",
            "Bold of you to say that out loud.",
            "My cat gives better presentations.",
            "Did ChatGPT write that part?",
            "Groundbreaking. Someone call the Nobel committee.",
            "I've heard better ideas from my Uber driver.",
            "Wow, never heard THAT before... said no one.",
            "You're really committing to this bit, huh?",
        ]
        import random
        return random.choice(fallbacks)

    def _fallback_crowd_work(self, topic: str, theme: str) -> list[str]:
        return [
            f"Let's go! Tell us about {topic.split()[-1] if topic.split() else 'it'}!",
            "I bet this is another 'disrupting the industry' pitch...",
            f"I hope this is better than the last '{topic[:20]}' talk!",
        ]


llm_service = LLMService()
