import unittest
import asyncio

from models import HecklerType
from services.llm_service import llm_service


class HeckleDirectorTests(unittest.TestCase):
    def test_first_heckle_uses_topic_in_fallback(self):
        text = llm_service._fallback_heckle(
            transcript="I am building a marketplace for collectors.",
            persona=HecklerType.CLASSIC_HECKLER,
            topic="Collector Marketplace",
            first_heckle=True,
        )

        self.assertIn("Collector Marketplace", text)
        self.assertNotIn("evidence", text.lower())

    def test_persona_selection_uses_topic_context(self):
        persona = llm_service.choose_persona(
            transcript_segment="Our NFT trader helps collectors trade JPEG assets faster.",
            topic="NFT Trader",
            recent_personas=[],
        )

        self.assertIn(
            persona,
            {
                HecklerType.TEEN,
                HecklerType.CLASSIC_HECKLER,
                HecklerType.KNOW_IT_ALL,
            },
        )

    def test_reaction_matches_line_type(self):
        reaction = llm_service.reaction_for_heckle(
            heckle_text="NFTs in 2026? Bold choice reviving the JPEG casino.",
            persona=HecklerType.CLASSIC_HECKLER,
            topic="NFT Trader",
            intensity=4,
        )

        self.assertEqual(reaction, "laugh")

    def test_topic_brief_is_dynamic_not_topic_scripted(self):
        brief = llm_service._topic_brief(
            topic="NFT Trader",
            transcript_segment="A marketplace for collectors to trade NFTs.",
        )

        self.assertIn("Infer the niche", brief)
        self.assertIn("topic/transcript", brief)
        self.assertNotIn("NFT", brief)

    def test_heckle_event_has_persona_text_and_reaction_without_llm(self):
        original_client = llm_service.client
        llm_service.client = None
        try:
            event = asyncio.run(llm_service.generate_heckle_event(
                transcript_segment="We help founders validate ideas before launch.",
                previous_heckles=[],
                topic="Startup Validation Coach",
                first_heckle=True,
            ))
        finally:
            llm_service.client = original_client

        self.assertIn(event["persona"], {persona.value for persona in HecklerType})
        self.assertTrue(event["text"])
        self.assertIn(event["reaction"], {"laugh", "whisper", "murmur", "boo"})


if __name__ == "__main__":
    unittest.main()
