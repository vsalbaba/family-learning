import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, children, farmageddon, game_progress, lessons, packages, questions, rewards, tts

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("TESTING") != "1":
        Path("data").mkdir(exist_ok=True)
        Path("data/tts_cache").mkdir(exist_ok=True)
        Base.metadata.create_all(bind=engine)
        _run_migrations()
    yield


def _run_migrations():
    """Apply pending Alembic migrations at startup."""
    alembic_cfg = Config(
        str(Path(__file__).resolve().parent.parent / "alembic.ini")
    )
    command.upgrade(alembic_cfg, "head")
    logger.info("Alembic migrations applied")


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
app.include_router(questions.router, prefix="/api/questions", tags=["questions"])
app.include_router(lessons.router, prefix="/api/lessons", tags=["lessons"])
app.include_router(tts.router, prefix="/api/tts", tags=["tts"])
app.include_router(rewards.router, prefix="/api/rewards", tags=["rewards"])
app.include_router(farmageddon.router, prefix="/api/farmageddon", tags=["farmageddon"])
app.include_router(game_progress.router, prefix="/api/game-progress", tags=["game-progress"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
