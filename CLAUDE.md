# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Family Learning is a self-hosted practice engine for children. Parents import learning packages (JSON), children take short lessons (3–10 questions across 7 activity types), get immediate feedback, and progress is tracked via spaced repetition (simplified SM-2). UI strings are in Czech.

**Stack:** FastAPI + SQLAlchemy + SQLite (backend), React 19 + TypeScript + Vite (frontend), Docker/Podman deployment.

## Commands

### Backend (from `backend/`)
```bash
pip install -e ".[dev]"                          # install with dev deps
python -m uvicorn app.main:app --reload          # dev server on :8000
pytest -v                                        # run all tests
pytest tests/test_lesson_engine.py -v -s         # single test file, verbose
```

### Frontend (from `frontend/`)
```bash
npm install
npm run dev          # Vite dev server on :5173, proxies /api → :8000
npm run build        # tsc -b && vite build
npm run lint         # eslint
npm test             # vitest run
npm run test:watch   # vitest in watch mode
```

### Docker
```bash
cp .env.example .env && podman-compose up --build   # or docker compose
```

## Architecture

### Backend (`backend/app/`)

Routes use FastAPI dependency injection for DB sessions and auth:
```python
def handler(user: User = Depends(require_parent), db: Session = Depends(get_db))
```

- **`routers/`** — API endpoints (auth, packages, lessons, children, rewards, tts)
- **`services/`** — Business logic: `lesson_engine.py` (item selection with budget-based allocation), `spaced_repetition.py` (SM-2), `package_validator.py` (JSON Schema + semantic validation), `auth_service.py` (JWT + PIN)
- **`models/`** — SQLAlchemy ORM: User, Package, Item, LearningSession, Answer, ReviewState
- **`schemas/`** — Pydantic request/response models
- **`package_schema/`** — JSON Schema for package validation (`package_v1.json`)

Auth is PIN-based (4-digit, bcrypt). Two roles: `parent` (manages content) and `child` (takes lessons). Access control via `require_parent()` / `require_child()` dependency functions.

No migration tool in use — schema changes are manual SQL in `main.py` lifespan (`_migrate_add_columns`).

### Frontend (`frontend/src/`)

- **`api/`** — Fetch wrapper (`client.ts`) auto-adds JWT from localStorage; per-domain modules (auth, packages, lessons, rewards)
- **`pages/`** — Route-level components. Parent routes: `/`, `/import`, `/packages/:id`, `/children`. Child routes: `/lesson/:id`, `/games/hero-walk`
- **`components/activities/`** — One component per activity type: MultipleChoice, TrueFalse, FillIn, Flashcard, Matching, Ordering, MathInput
- **`components/lesson/`** — LessonRunner (state machine: idle → loading → answering → feedback → summary), QuestionCard, FeedbackOverlay, LessonSummary
- **`contexts/`** — AuthContext (user, token, logout)
- **`games/`** — Hero-walk mini-game (map generation, grid movement)

### Key Flows

**Package import:** User uploads JSON → backend validates (hard errors block, soft warnings allow) → creates Package (draft) + Items → parent previews and publishes.

**Lesson:** Child picks package → `build_lesson_item_sequence()` selects items using budget buckets (learning > due > new > not-due) with anti-repeat penalties → child answers → `submitAnswer()` updates ReviewState → summary + rewards.

**Validation:** Two-tier — `hard_errors` block import, `soft_warnings` are informational. Error codes: E001, E002, etc.

### Testing

Backend: pytest with in-memory SQLite. Key fixtures in `conftest.py`: `db_session`, `client`, `parent_user`, `child_user`. 12 test files.

Frontend: Vitest configured but minimal coverage.

## Notable Conventions

- Fill-in answers normalize Czech diacritics (háčky removed) for lenient comparison
- Complex answer data stored as JSON in `Item.answer_data`
- Reward system tracks `reward_progress`, `reward_streak`, `game_tokens` on User model
- CORS is `allow_origins=["*"]` (local-only use)
- TTS (Piper) is optional — endpoints handle missing voice models gracefully
- Config via env vars defined in `backend/app/config.py` (Pydantic Settings); see `.env.example`
