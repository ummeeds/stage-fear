import os
import json
import logging
import re
from typing import Optional
from datetime import datetime
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
        current_year = datetime.now().year
        topic_brief = self._topic_brief(topic, transcript_segment)
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
- Current year: {current_year}
- Real-world topic brief: {topic_brief}
- Recent heckles from others (do NOT repeat these): {recent}
- Timing rule: {first_rule}

Before writing the heckle, silently infer the best real-world attack angle:
1. Identify the exact niche from the topic and transcript, not just the broad category.
2. Infer what a sharp audience member would already know or suspect about that niche in {current_year}.
3. Prefer specific banter over generic critique: bad timing, market fatigue, trust gap, weak demand, unclear buyer, crowded category, regulation, incentives, pricing, proof burden, or fragile differentiation.
4. If the speaker says something concrete, react to that exact claim. If they only gave the topic, react to the topic's most obvious public skepticism.
5. Stay in persona: skeptical asks a sharp question, teen is dismissive, know-it-all corrects, classic heckler lands the punchline, nervous worries, critic names the flaw.

Rules:
- Reference at least one concrete noun from the topic or the speaker's latest line.
- Keep it under 14 words.
- Make it useful public-speaking pressure, not random abuse.
- Do not use generic filler: "get to the point", "what's your evidence", "that doesn't add up", "are you sure", unless tied to a concrete noun.
- Do not explain the joke or mention these instructions.

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
                    or "are you sure" in heckle.lower()
                    or "concrete evidence" in heckle.lower()
                )
                if generic:
                    return self._fallback_heckle(transcript_segment, persona_type, topic, first_heckle)
                logger.info(f"LLM heckle ({persona_type.value}): {heckle}")
                return heckle
            return self._fallback_heckle(transcript_segment, persona_type, topic, first_heckle)
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return self._fallback_heckle(transcript_segment, persona_type, topic, first_heckle)

    async def generate_heckle_event(
        self,
        transcript_segment: str,
        previous_heckles: list[str],
        topic: str,
        first_heckle: bool = False,
        avoid_personas: Optional[list[HecklerType]] = None,
    ) -> dict:
        """Choose persona, heckle text, and reaction in one LLM call."""
        recent = "\n".join(previous_heckles[-5:]) if previous_heckles else "(none yet)"
        current_year = datetime.now().year
        topic_brief = self._topic_brief(topic, transcript_segment)
        persona_names = ", ".join(persona.value for persona in HecklerType)
        avoid_personas = avoid_personas or []
        avoid_names = ", ".join(persona.value for persona in avoid_personas) or "(none)"

        if not self.client:
            persona = self.choose_persona(transcript_segment, topic, avoid_personas)
            text = self.polish_for_speech(
                self._fallback_heckle(transcript_segment, persona, topic, first_heckle),
                persona,
            )
            return {
                "persona": persona.value,
                "text": text,
                "reaction": self.reaction_for_heckle(text, persona, topic, 3),
            }

        system_prompt = f"""You are the live heckle director for Stage Fear.

Choose the best heckler persona, write one short heckle, and choose a crowd reaction.

Available personas:
- skeptic: sharp question, doubts claims, asks what would prove it
- teen: bored, dismissive, modern slang, roasts stale trends
- know_it_all: "actually..." correction, technical/business nitpick
- classic_heckler: punchline-first crowd-work roast
- nervous: anxious, worried about risk or embarrassment
- critic: precise judge, names the business/logic flaw

Context:
- Topic: {topic}
- Current year: {current_year}
- Real-world topic brief: {topic_brief}
- Recent heckles to avoid repeating: {recent}
- Recently used personas to avoid unless absolutely necessary: {avoid_names}
- First heckle: {first_heckle}

Rules:
- Infer the exact niche and its real-world skepticism from the topic/transcript.
- Do not use static template jokes. Do not write generic presentation critique.
- Rotate the room. Do not choose a persona listed in "recently used personas" unless every other persona is a bad fit.
- The heckle must reference concrete nouns from the topic or latest transcript.
- Keep the heckle under 14 words and natural when spoken aloud.
- Pick reaction from exactly one of: laugh, whisper, murmur, boo.
- Use whisper for sharp analytical doubt, murmur for anxiety/risk, laugh for punchlines, boo for harsher crowd disapproval.

Return strict JSON only:
{{"persona":"one of {persona_names}","text":"heckle","reaction":"laugh|whisper|murmur|boo"}}"""

        user_prompt = f'The speaker just said: "{transcript_segment}"'

        try:
            last_payload: dict = {}
            for attempt in range(2):
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ]
                if attempt:
                    messages.append({
                        "role": "user",
                        "content": (
                            "The previous draft was too generic, repeated, or not grounded. "
                            "Write a different heckle using concrete words from the latest transcript."
                        ),
                    })
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    max_tokens=120,
                    temperature=0.92,
                    response_format={"type": "json_object"},
                )
                content = response.choices[0].message.content or "{}"
                payload = json.loads(content)
                persona = HecklerType(payload.get("persona", HecklerType.CLASSIC_HECKLER.value))
                text = self.polish_for_speech(str(payload.get("text", "")).strip().strip('"'), persona)
                reaction = str(payload.get("reaction", "laugh")).strip().lower()
                if reaction not in {"laugh", "whisper", "murmur", "boo"}:
                    reaction = "laugh"
                last_payload = {"persona": persona.value, "text": text, "reaction": reaction}
                if (
                    text
                    and persona not in avoid_personas[:2]
                    and not self._is_repetitive_or_ungrounded(text, previous_heckles, topic, transcript_segment)
                ):
                    return last_payload
            persona = self.choose_persona(transcript_segment, topic, avoid_personas)
            text = self.polish_for_speech(
                self._fallback_heckle(transcript_segment, persona, topic, first_heckle),
                persona,
            )
            return {
                "persona": persona.value,
                "text": text,
                "reaction": self.reaction_for_heckle(text, persona, topic, 3),
            }
        except Exception as e:
            logger.error(f"LLM heckle event error: {e}")
            persona = self.choose_persona(transcript_segment, topic, avoid_personas)
            text = self.polish_for_speech(
                self._fallback_heckle(transcript_segment, persona, topic, first_heckle),
                persona,
            )
            return {
                "persona": persona.value,
                "text": text,
                "reaction": self.reaction_for_heckle(text, persona, topic, 3),
            }

    def _is_repetitive_or_ungrounded(self, text: str, previous_heckles: list[str], topic: str, transcript: str) -> bool:
        lowered = text.lower()
        if any(generic in lowered for generic in (
            "get to the point",
            "are you sure",
            "what's your evidence",
            "needs number",
            "need number",
            "needs numbers behind it",
            "need numbers behind it",
            "that argument needs numbers",
        )):
            return True
        if lowered.count("number") + lowered.count("numbers") > 1:
            return True
        text_words = self._meaningful_words(text)
        if not text_words:
            return True
        for previous in previous_heckles[-8:]:
            previous_words = self._meaningful_words(previous)
            if lowered == previous.lower().strip():
                return True
            if previous_words and len(text_words & previous_words) / max(1, len(text_words | previous_words)) >= 0.32:
                return True
        source_words = self._meaningful_words(f"{topic} {transcript}")
        return bool(source_words) and not bool(text_words & source_words)

    def _meaningful_words(self, text: str) -> set[str]:
        return {
            word.lower()
            for word in re.findall(r"[A-Za-z][A-Za-z'-]{3,}", text)
            if word.lower() not in {"that", "this", "with", "from", "your", "they", "them", "what", "where"}
        }

    def choose_persona(self, transcript_segment: str, topic: str, recent_personas: list[HecklerType]) -> HecklerType:
        """Pick the heckler who would naturally jump in for this moment."""
        lower = f"{topic} {transcript_segment}".lower()
        scores = {persona: 1 for persona in HecklerType}

        stale_hype_terms = ("nft", "web3", "crypto", "metaverse", "dao", "token", "blockchain")
        business_terms = ("market", "revenue", "customers", "pricing", "growth", "launch", "sales", "users")
        evidence_terms = ("data", "study", "research", "proof", "metrics", "numbers", "roi", "retention")
        technical_terms = ("ai", "model", "algorithm", "api", "automation", "platform", "agent", "workflow")
        risk_terms = ("trust", "security", "privacy", "regulation", "compliance", "risk", "fraud")

        if any(term in lower for term in stale_hype_terms):
            scores[HecklerType.TEEN] += 3
            scores[HecklerType.CLASSIC_HECKLER] += 3
            scores[HecklerType.KNOW_IT_ALL] += 2
        if any(term in lower for term in business_terms):
            scores[HecklerType.CRITIC] += 3
            scores[HecklerType.SKEPTIC] += 2
        if any(term in lower for term in evidence_terms):
            scores[HecklerType.SKEPTIC] += 3
            scores[HecklerType.CRITIC] += 2
        if any(term in lower for term in technical_terms):
            scores[HecklerType.KNOW_IT_ALL] += 3
            scores[HecklerType.CRITIC] += 1
        if any(term in lower for term in risk_terms):
            scores[HecklerType.NERVOUS] += 2
            scores[HecklerType.CRITIC] += 2
            scores[HecklerType.SKEPTIC] += 1
        if len(transcript_segment.split()) < 18:
            scores[HecklerType.TEEN] += 1
            scores[HecklerType.CLASSIC_HECKLER] += 1

        for persona in recent_personas[-3:]:
            scores[persona] = max(0, scores[persona] - 5)

        best_score = max(scores.values())
        candidates = [persona for persona, score in scores.items() if score == best_score]
        import random
        return random.choice(candidates)

    def reaction_for_heckle(self, heckle_text: str, persona: HecklerType, topic: str, intensity: int) -> str:
        """Choose a crowd reaction SFX for the line."""
        lower = f"{topic} {heckle_text}".lower()
        if persona in {HecklerType.CRITIC, HecklerType.KNOW_IT_ALL, HecklerType.SKEPTIC}:
            return "whisper"
        if persona == HecklerType.NERVOUS:
            return "murmur"
        if any(term in lower for term in ("nft", "crypto", "metaverse", "hype", "jpeg", "casino")):
            return "laugh"
        if intensity >= 4:
            return "boo"
        return "laugh"

    def polish_for_speech(self, text: str, persona: HecklerType) -> str:
        """Light punctuation pass so TTS sounds like a person, not a caption."""
        cleaned = " ".join(text.strip().split())
        if not cleaned:
            return cleaned
        if persona == HecklerType.TEEN and not cleaned.endswith(("?", "!", ".")):
            return f"{cleaned}."
        if persona == HecklerType.NERVOUS and not cleaned.startswith(("Um", "Uh", "Wait")):
            return f"Wait... {cleaned}"
        if persona == HecklerType.KNOW_IT_ALL and cleaned.lower().startswith("actually"):
            return cleaned.replace("Actually,", "Actually...", 1)
        return cleaned

    def _topic_brief(self, topic: str, transcript_segment: str = "") -> str:
        """Prompt scaffold for dynamic topic intelligence; no topic-specific scripts."""
        return (
            "Infer the niche, audience, trend timing, public skepticism, buyer motivation, "
            "trust problem, proof burden, business model, and likely failure mode from the "
            "topic/transcript itself. Use concrete nouns from the user's topic; do not fall "
            "back to generic presentation critique."
        )

    async def generate_crowd_work(self, topic: str, theme: str) -> list[str]:
        """Generate pre-stage crowd reactions."""
        topic_brief = self._topic_brief(topic)
        if not self.client:
            return self._fallback_crowd_work(topic)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": f"""You are a rowdy but fun crowd at a live event.
Generate 3 crowd reactions before someone goes on stage.
1. A hyped supporter shouting encouragement
2. A skeptic making a funny prediction using real-world baggage
3. A random funny observation about the topic's obvious weakness
Real-world topic brief: {topic_brief}
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
        if first_heckle:
            return f"So {target} is the big breakthrough we're betting on?"

        fallbacks = {
            HecklerType.SKEPTIC: [
                f"Who still has liquidity for {target} after the hype cycle?",
                f"But how do you prove {target} actually works?",
                f"What's the evidence behind {target}?",
                "Are you sure about that?",
                "What assumption are we supposed to accept there?",
                "Have you considered the opposite?",
            ],
            HecklerType.TEEN: [
                f"{target} sounds like a 2021 trend wearing a fake mustache.",
                f"{target} sounds like three apps in a trench coat.",
                "Cool story, but where's the actual point?",
                f"I've seen {target} on Product Hunt already.",
                "Can we skip to the end?",
                "My phone is more interesting.",
            ],
            HecklerType.KNOW_IT_ALL: [
                f"Actually, {target}'s real problem is liquidity, not branding.",
                f"Actually, {target} has a much harder adoption problem.",
                "Technically, that market is already crowded.",
                "I read the opposite in a paper.",
                "Let me correct you on that.",
                "The real answer is different.",
            ],
            HecklerType.CLASSIC_HECKLER: [
                f"{target}? Even the hype cycle left early!",
                f"{target} better have a punchline!",
                "That pitch needs a seatbelt!",
                "My grandmother has a clearer roadmap!",
                "Is this a product launch or a trailer?",
                "Someone get this pitch some traction!",
            ],
            HecklerType.NERVOUS: [
                f"I'm worried {target} peaked before you opened the slides.",
                "Are you okay up there?",
                f"I'm nervous for {target} already.",
                "My hands are sweating for you.",
                "I could never do this.",
                "Take a deep breath!",
            ],
            HecklerType.CRITIC: [
                f"The weak point is whether {target} still has demand.",
                f"The weak point is {target}'s actual differentiation.",
                "You're missing the adoption risk.",
                f"{target} still needs proof people actually want it.",
                "Let's separate the feature from the business.",
                "The data burden is doing heavy lifting there.",
            ],
        }
        import random
        return random.choice(fallbacks.get(persona, fallbacks[HecklerType.CLASSIC_HECKLER]))

    def _fallback_crowd_work(self, topic: str) -> list[str]:
        return [
            f"Let's go! Tell us about {topic.split()[-1] if topic.split() else 'it'}!",
            f"I hope {topic or 'this'} has a real buyer, not just vibes.",
            f"Let's see what breaks first: the demo or the market logic.",
        ]


llm_service = LLMService()
