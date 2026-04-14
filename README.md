# Family Learning

A self-hosted web app for practising school material at home. Parents import
ready-made JSON learning packages, review and publish them. Children pick a
package, run a short lesson (3-10 questions), and get immediate feedback on
every answer.

The app is a **practice engine** — it does not generate content. Packages are
authored externally (or by hand) and imported as JSON files.

## Features

- **7 activity types** — multiple choice, true/false, fill-in-the-blank,
  flashcard, matching, ordering, and numeric (math) input
- **Two-tier validation** — hard errors block import, soft warnings are shown
  but don't prevent saving
- **Spaced repetition** (simplified SM-2) — tracks what each child knows and
  schedules review
- **PIN-based auth** — no emails, no passwords; family-friendly 4-digit PINs
- **Role separation** — parents manage packages and children; children only see
  published content

## Tech stack

| Layer    | Choice                          |
|----------|---------------------------------|
| Backend  | FastAPI, SQLAlchemy, SQLite      |
| Frontend | React 19, TypeScript, Vite       |
| Auth     | PIN + JWT (bcrypt hashing)       |
| Infra    | Podman / Docker Compose (2 containers) |

## Quick start

```bash
cp .env.example .env        # edit JWT_SECRET for production
podman-compose up --build    # or: docker compose up --build
```

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:8000/docs>

On first visit, click **Vytvořit nový účet** to create a parent account. You will
be asked for the **app PIN** (set via `PARENT_PIN` env var, default `1234`),
then your name and a personal 4-digit login PIN. After that:

1. **Import a package** — paste JSON or upload a `.json` file
2. **Publish it** — children can only see published packages
3. **Create a child account** — name + PIN
4. Log out, log in as the child, pick a package, and start a lesson

## Environment variables

| Variable        | Default                    | Description              |
|-----------------|----------------------------|--------------------------|
| `JWT_SECRET`    | `change-me-in-production`  | Secret for signing JWTs  |
| `PARENT_PIN`    | `1234`                     | App PIN required to create the parent account |
| `BACKEND_PORT`  | `8000`                     | Host port for the API    |
| `FRONTEND_PORT` | `3000`                     | Host port for the UI     |

## Package JSON format

A package is a JSON file with `metadata` and an `items` array. Each item has a
`type` that determines which extra fields are required.

```jsonc
{
  "metadata": {
    "name": "European Capitals",       // required
    "subject": "Geography",            // optional
    "difficulty": "easy",              // optional: easy | medium | hard
    "description": "Practice capitals" // optional
  },
  "items": [
    // ... see activity types below
  ]
}
```

### Activity types

**multiple_choice** — pick one correct option

```json
{
  "type": "multiple_choice",
  "question": "Capital of France?",
  "options": ["London", "Paris", "Berlin"],
  "correct": 1
}
```

**true_false** — agree or disagree with a statement

```json
{
  "type": "true_false",
  "question": "The capital of Germany is Munich.",
  "correct": false
}
```

**fill_in** — type the answer

```json
{
  "type": "fill_in",
  "question": "The capital of Czech Republic is ___.",
  "accepted_answers": ["Praha", "Prague"],
  "case_sensitive": false
}
```

**flashcard** — self-reported (knew it / didn't know)

```json
{
  "type": "flashcard",
  "question": "Capital of Portugal?",
  "answer": "Lisbon"
}
```

**matching** — connect left items to right items

```json
{
  "type": "matching",
  "question": "Match countries to capitals:",
  "pairs": [
    { "left": "Italy", "right": "Rome" },
    { "left": "Spain", "right": "Madrid" }
  ]
}
```

**ordering** — drag items into the correct sequence

```json
{
  "type": "ordering",
  "question": "Order these capitals west to east:",
  "correct_order": ["Lisbon", "Madrid", "Paris", "Berlin"]
}
```

**math_input** — enter a number (with optional tolerance)

```json
{
  "type": "math_input",
  "question": "How many EU member states? (2024)",
  "correct_value": 27,
  "tolerance": 0,
  "unit": "states"
}
```

Every item can optionally include `hint`, `explanation`, and `tags` fields.

A complete sample package with all 7 types is at
[`backend/app/seed/sample_package.json`](backend/app/seed/sample_package.json).

## Development

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest -v                    # 112 tests

# Frontend
cd frontend
npm install
npm run dev                  # Vite dev server on :5173, proxies /api to :8000
```

## Project layout

```
backend/
  app/
    main.py                  # FastAPI app
    routers/                 # auth, packages, lessons, children
    services/                # validator, lesson engine, spaced repetition
    models/                  # SQLAlchemy ORM
    package_schema/          # JSON Schema for package validation
    seed/                    # sample package
  tests/                     # pytest suite (112 tests)

frontend/
  src/
    pages/                   # ParentHome, ChildHome, ImportPage, LessonPage, ...
    components/
      activities/            # MultipleChoice, TrueFalse, FillIn, Flashcard, ...
      lesson/                # LessonRunner, QuestionCard, FeedbackOverlay, ...
      auth/                  # LoginScreen, PinInput
    api/                     # fetch client with JWT auth
    contexts/                # AuthContext
```
