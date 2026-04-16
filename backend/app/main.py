import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, children, farmageddon, lessons, packages, rewards, tts


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

        # Package table migrations
        cursor = raw.execute("PRAGMA table_info(package)")
        pkg_columns = {row[1] for row in cursor.fetchall()}
        if "tts_lang" not in pkg_columns:
            raw.execute("ALTER TABLE package ADD COLUMN tts_lang TEXT")
        if "subject_display" not in pkg_columns:
            raw.execute("ALTER TABLE package ADD COLUMN subject_display TEXT")
            # Backfill: preserve original subject as display, then normalize subject
            raw.execute(
                "UPDATE package SET subject_display = subject"
                " WHERE subject IS NOT NULL AND subject_display IS NULL"
            )
            raw.execute(
                "UPDATE package SET subject = LOWER(TRIM(subject))"
                " WHERE subject IS NOT NULL"
            )
        raw.commit()

        # Session table migration: make package_id nullable, add subject
        _migrate_session_table(raw)

        # User table: reward columns
        cursor = raw.execute("PRAGMA table_info(user)")
        user_columns = {row[1] for row in cursor.fetchall()}
        for col in ("reward_progress", "reward_streak", "game_tokens"):
            if col not in user_columns:
                raw.execute(
                    f"ALTER TABLE user ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0"
                )
        # Backfill NULLs for existing rows (SQLite may leave NULL despite DEFAULT)
        for col in ("reward_progress", "reward_streak", "game_tokens"):
            raw.execute(f"UPDATE user SET {col} = 0 WHERE {col} IS NULL")
        raw.commit()

        # User table: pin_plain column
        if "pin_plain" not in user_columns:
            raw.execute("ALTER TABLE user ADD COLUMN pin_plain TEXT")
        raw.commit()

        # Session table: extension_count column
        cursor = raw.execute("PRAGMA table_info(session)")
        sess_columns = {row[1] for row in cursor.fetchall()}
        if "extension_count" not in sess_columns:
            raw.execute(
                "ALTER TABLE session ADD COLUMN extension_count INTEGER NOT NULL DEFAULT 0"
            )
        raw.execute("UPDATE session SET extension_count = 0 WHERE extension_count IS NULL")
        raw.commit()


def _migrate_session_table(raw):
    """Rebuild session table: make package_id nullable, add subject column.

    SQLite cannot ALTER COLUMN, so we rebuild the table.
    The answer table has session_id FK with ON DELETE CASCADE,
    so we must disable FK enforcement during the rebuild.
    """
    cursor = raw.execute("PRAGMA table_info(session)")
    columns = {row[1] for row in cursor.fetchall()}
    if "subject" in columns:
        return  # already migrated

    raw.execute("PRAGMA foreign_keys = OFF")
    try:
        raw.execute("BEGIN TRANSACTION")

        raw.execute("""
            CREATE TABLE session_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                child_id INTEGER NOT NULL REFERENCES user(id),
                package_id INTEGER REFERENCES package(id),
                subject TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                finished_at DATETIME,
                total_questions INTEGER NOT NULL,
                correct_count INTEGER NOT NULL DEFAULT 0,
                item_ids TEXT NOT NULL DEFAULT '[]'
            )
        """)
        raw.execute("""
            INSERT INTO session_new
                (id, child_id, package_id, started_at, finished_at,
                 total_questions, correct_count, item_ids)
            SELECT id, child_id, package_id, started_at, finished_at,
                   total_questions, correct_count, item_ids
            FROM session
        """)
        raw.execute("DROP TABLE session")
        raw.execute("ALTER TABLE session_new RENAME TO session")

        raw.execute("COMMIT")
    except Exception:
        raw.execute("ROLLBACK")
        raise
    finally:
        raw.execute("PRAGMA foreign_keys = ON")

    # Verify FK integrity after rebuild
    violations = raw.execute("PRAGMA foreign_key_check(session)").fetchall()
    if violations:
        raise RuntimeError(f"FK violations after session migration: {violations}")


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
app.include_router(rewards.router, prefix="/api/rewards", tags=["rewards"])
app.include_router(farmageddon.router, prefix="/api/farmageddon", tags=["farmageddon"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
