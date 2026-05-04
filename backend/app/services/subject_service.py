"""Subject resolution: normalize legacy text → Subject record."""

import re
import unicodedata

from sqlalchemy.orm import Session

from app.models.subject import Subject

_DEFAULT_SLUG = "nezarazeno"

# Runtime mapping — independent copy from Alembic migration snapshot.
LEGACY_SUBJECT_MAP: dict[str, str] = {
    "anglictina": "anglictina",
    "matematika": "matematika",
    "prirodoveda": "prirodoveda",
    "prvouka": "prirodoveda",
    "zemepis": "vlastiveda",
    "cesky jazyk": "cestina",
    "test": "nezarazeno",
}


def normalize_text(s: str) -> str:
    s = s.strip().lower()
    nfkd = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in nfkd if not unicodedata.combining(c))
    s = s.replace("-", " ").replace("_", " ")
    s = re.sub(r"\s+", " ", s)
    return s


def resolve_subject(db: Session, text: str | None) -> Subject | None:
    if not text or not text.strip():
        return None
    normalized = normalize_text(text)
    slug = LEGACY_SUBJECT_MAP.get(normalized)
    if slug:
        subj = db.query(Subject).filter(Subject.slug == slug).first()
        if subj:
            return subj
    subj = db.query(Subject).filter(Subject.slug == normalized).first()
    if subj:
        return subj
    subj = db.query(Subject).filter(Subject.name.ilike(text.strip())).first()
    return subj


def resolve_subject_or_default(db: Session, text: str | None) -> Subject:
    subj = resolve_subject(db, text)
    if subj:
        return subj
    return get_default_subject(db)


def get_subject_by_slug(db: Session, slug: str) -> Subject | None:
    return db.query(Subject).filter(Subject.slug == slug).first()


def get_default_subject(db: Session) -> Subject:
    subj = db.query(Subject).filter(Subject.slug == _DEFAULT_SLUG).one()
    return subj


def list_active_subjects(db: Session) -> list[Subject]:
    return (
        db.query(Subject)
        .filter(Subject.is_active.is_(True))
        .order_by(Subject.sort_order)
        .all()
    )
