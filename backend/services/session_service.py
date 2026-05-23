import os
import uuid
import logging
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from models import SessionCreate, HeckleEvent, SessionState

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "stage-fear")

if not MONGO_URI:
    logger.error("MONGO_URI not set!")

from typing import Union
client: Union[AsyncIOMotorClient, None] = None
db = None


def get_db():
    global client, db
    if client is None and MONGO_URI:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[DB_NAME]
    return db


async def create_session(data: SessionCreate) -> SessionState:
    database = get_db()
    if database is None:
        raise Exception("Database not connected")

    session = SessionState(
        id=str(uuid.uuid4()),
        topic=data.topic,
        name=data.name,
        theme=data.theme,
        intensity=data.intensity,
        transcript=[],
        heckles=[],
        created_at=datetime.utcnow(),
        status="crowd_work",
    )

    await database.sessions.insert_one(session.model_dump())
    return session


async def get_session(session_id: str) -> Optional[SessionState]:
    database = get_db()
    if database is None:
        return None
    doc = await database.sessions.find_one({"id": session_id})
    if doc:
        doc.pop("_id", None)
        return SessionState(**doc)
    return None


async def update_session_status(session_id: str, status: str) -> None:
    database = get_db()
    if database is None:
        return
    await database.sessions.update_one(
        {"id": session_id}, {"$set": {"status": status}}
    )


async def add_transcript_segment(session_id: str, segment: str) -> None:
    database = get_db()
    if database is None:
        return
    await database.sessions.update_one(
        {"id": session_id}, {"$push": {"transcript": segment}}
    )


async def add_heckle(session_id: str, heckle: HeckleEvent) -> None:
    database = get_db()
    if database is None:
        return
    await database.sessions.update_one(
        {"id": session_id}, {"$push": {"heckles": heckle.model_dump()}}
    )


async def get_recent_heckles(session_id: str, limit: int = 10) -> list[str]:
    database = get_db()
    if database is None:
        return []
    doc = await database.sessions.find_one({"id": session_id})
    if doc and "heckles" in doc:
        heckles = doc["heckles"]
        return [h["text"] for h in heckles[-limit:]]
    return []
