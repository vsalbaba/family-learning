import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, children, lessons, packages, tts


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("TESTING") != "1":
        Path("data").mkdir(exist_ok=True)
        Path("data/tts_cache").mkdir(exist_ok=True)
        Base.metadata.create_all(bind=engine)
        # Add columns that may not exist yet (create_all doesn't alter tables)
        _migrate_add_columns(engine)
    yield


def _migrate_add_columns(eng):
    """Add new columns to existing tables if they don't exist yet."""
    with eng.connect() as conn:
        raw = conn.connection.connection  # type: ignore[union-attr]
        cursor = raw.execute("PRAGMA table_info(package)")
        columns = {row[1] for row in cursor.fetchall()}
        if "tts_lang" not in columns:
            raw.execute("ALTER TABLE package ADD COLUMN tts_lang TEXT")
            raw.commit()


app = FastAPI(title="Family Learning", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(children.router, prefix="/api/children", tags=["children"])
app.include_router(packages.router, prefix="/api/packages", tags=["packages"])
app.include_router(lessons.router, prefix="/api/lessons", tags=["lessons"])
app.include_router(tts.router, prefix="/api/tts", tags=["tts"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
