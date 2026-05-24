import asyncio
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "frontend" / "public" / "sfx"

SOUNDS = {
    "ui-hover.mp3": "short crisp 8-bit arcade menu hover blip, soft digital tick, retro pixel game UI, no melody, no voice",
    "ui-select.mp3": "short satisfying 8-bit arcade menu confirm sound, bright pixel chime, retro game UI, no voice",
    "ui-back.mp3": "short low 8-bit arcade cancel sound, soft descending pixel bloop, retro game UI, no voice",
    "crowd-boo.mp3": "small theater audience booing and groaning after a bad line, natural crowd reaction, no words, no music, no announcer",
}


async def generate_sound(client: httpx.AsyncClient, api_key: str, filename: str, prompt: str) -> None:
    response = await client.post(
        "https://api.elevenlabs.io/v1/sound-generation",
        json={
            "text": prompt,
            "duration_seconds": 1.6 if filename == "crowd-boo.mp3" else 0.5,
            "prompt_influence": 0.35,
        },
        headers={
            "xi-api-key": api_key,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
        },
    )
    response.raise_for_status()
    path = OUT_DIR / filename
    path.write_bytes(response.content)
    print(f"Wrote {path} ({len(response.content)} bytes)")


async def main() -> None:
    load_dotenv(ROOT / "backend" / ".env")
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is not set")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=45.0) as client:
        for filename, prompt in SOUNDS.items():
            await generate_sound(client, api_key, filename, prompt)


if __name__ == "__main__":
    asyncio.run(main())
