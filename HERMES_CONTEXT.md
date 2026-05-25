# Stage Fear Hermes Context

Stage Fear is an ElevenHacks web app for voice-powered public speaking practice. Users choose a pixel-art speaker, enter a talk topic, walk onto a virtual stage, then practice while six AI hecklers interrupt with contextual spoken roasts using ElevenLabs.

## Product Goals

- Make public speaking practice feel like a game, not a form.
- Keep the stage experience polished: pixel art, animated speaker, spotlight, ambient crowd, persona-based hecklers.
- Heckles must react to what the user actually said. Do not trigger on mic checks, greetings, silence, music, or non-English STT noise.
- Heckler audio matters more than text. Text is only a synchronized subtitle.
- Mobile must work over HTTPS because browser microphone APIs require a secure context.

## Architecture

- `frontend/`: Next.js 14 app on port `3005`.
- `frontend/components/StageGame.tsx`: Phaser stage renderer.
- `backend/`: FastAPI app on port `8010`.
- `backend/services/elevenlabs_service.py`: ElevenLabs TTS, STT, and SFX generation.
- `backend/services/llm_service.py`: LLM heckle generation through OpenRouter.
- MongoDB stores sessions, transcript segments, and heckle events.

## Deployment

Production deployment uses Docker Compose:

```bash
docker compose -f docker-compose.stagefear.yml up -d --build
```

Current VPS deployment:

- Public app URL: `https://stage-fear.srv1680420.hstgr.cloud`
- Host project path: `/opt/stage-fear`
- Hermes project path: `/opt/data/projects/stage-fear`
- Compose command on VPS: `cd /opt/stage-fear && docker compose --env-file .env -f docker-compose.stagefear.yml up -d --build`

Required files on the server:

- `.env.backend` with `ELEVENLABS_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `LLM_MODEL`
- `STAGEFEAR_HOST` exported in the shell or `.env` next to the compose file

The VPS already runs Traefik. `docker-compose.stagefear.yml` adds Traefik labels:

- `https://${STAGEFEAR_HOST}` -> frontend
- `https://${STAGEFEAR_HOST}/api/*` -> backend
- `wss://${STAGEFEAR_HOST}/ws/*` -> backend websocket

## Current UX Priorities

- Stage character should stay centered and have slow, game-like walk/idle/speaking animation.
- Ambient crowd should continue while the user speaks.
- Boo SFX should be occasional and delayed, not attached to every heckler voice.
- First heckle should reference the product/topic directly.
- Keep UI close to the provided Stage Fear pixel-art reference, especially logo and heckler cards.

## Known Constraints

- Mobile microphone will fail on plain HTTP. Use HTTPS public host.
- The app currently relies on browser microphone permission, ElevenLabs STT, OpenRouter, ElevenLabs TTS, and websocket continuity.
- Avoid screenshot-heavy loops during routine work; use fast compile, endpoint, and real flow checks.
- GitHub access on the VPS/Hermes still needs an authenticated GitHub token or deploy key attached to `ummeeds/stage-fear`; the deployed snapshot has `origin` configured but unauthenticated HTTPS clone/fetch is blocked for this repo.
