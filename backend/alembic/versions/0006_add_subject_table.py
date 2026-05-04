"""Add subject table, seed data, FK columns on package/session, backfill.

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-03
"""
import unicodedata
import re
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_SUBJECTS = [
    ("cestina", "Čeština", 1),
    ("matematika", "Matematika", 2),
    ("prirodoveda", "Přírodověda", 3),
    ("anglictina", "Angličtina", 4),
    ("vlastiveda", "Vlastivěda", 5),
    ("chemie", "Chemie", 6),
    ("nezarazeno", "Nezařazeno", 99),
]

# Historical snapshot — NOT imported from application code.
# Keys are already normalized (lowercase, no diacritics, no hyphens/underscores).
LEGACY_MAPPING: dict[str, str] = {
    "anglictina": "anglictina",
    "matematika": "matematika",
    "prirodoveda": "prirodoveda",
    "prvouka": "prirodoveda",
    "zemepis": "vlastiveda",
    "cesky jazyk": "cestina",
    "test": "nezarazeno",
}


def _strip_diacritics(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _normalize(s: str) -> str:
    s = s.strip().lower()
    s = _strip_diacritics(s)
    s = s.replace("-", " ").replace("_", " ")
    s = re.sub(r"\s+", " ", s)
    return s


def upgrade() -> None:
    # 1. Create subject table
    op.create_table(
        "subject",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(), unique=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        if_not_exists=True,
    )

    # 2. Seed (OR IGNORE for idempotency on partial re-runs)
    for slug, name, sort_order in SEED_SUBJECTS:
        op.execute(
            sa.text(
                "INSERT OR IGNORE INTO subject (slug, name, sort_order, is_active) "
                "VALUES (:slug, :name, :sort_order, 1)"
            ).bindparams(slug=slug, name=name, sort_order=sort_order)
        )

    # 3. Add FK columns (skip if already present from partial run)
    conn = op.get_bind()
    pkg_cols = {r[1] for r in conn.execute(sa.text("PRAGMA table_info('package')")).fetchall()}
    sess_cols = {r[1] for r in conn.execute(sa.text("PRAGMA table_info('session')")).fetchall()}

    if "subject_id" not in pkg_cols:
        conn.execute(sa.text(
            "ALTER TABLE package ADD COLUMN subject_id INTEGER REFERENCES subject(id)"
        ))

    if "subject_id" not in sess_cols:
        conn.execute(sa.text(
            "ALTER TABLE session ADD COLUMN subject_id INTEGER REFERENCES subject(id)"
        ))

    # 4. Backfill package.subject_id (only rows where subject_id is still NULL)
    nezarazeno_id = conn.execute(
        sa.text("SELECT id FROM subject WHERE slug = 'nezarazeno'")
    ).scalar()

    packages = conn.execute(
        sa.text("SELECT id, subject FROM package WHERE subject_id IS NULL")
    ).fetchall()
    for pkg_id, subj_text in packages:
        if subj_text:
            normalized = _normalize(subj_text)
            target_slug = LEGACY_MAPPING.get(normalized, "nezarazeno")
        else:
            target_slug = "nezarazeno"
        subj_id = conn.execute(
            sa.text("SELECT id FROM subject WHERE slug = :slug"),
            {"slug": target_slug},
        ).scalar()
        if subj_id is None:
            subj_id = nezarazeno_id
        conn.execute(
            sa.text("UPDATE package SET subject_id = :sid WHERE id = :pid"),
            {"sid": subj_id, "pid": pkg_id},
        )

    # 5. Backfill session.subject_id (subject-mode only, still NULL)
    sessions = conn.execute(
        sa.text("SELECT id, subject FROM session WHERE package_id IS NULL AND subject_id IS NULL")
    ).fetchall()
    for sess_id, subj_text in sessions:
        if subj_text:
            normalized = _normalize(subj_text)
            target_slug = LEGACY_MAPPING.get(normalized, "nezarazeno")
        else:
            target_slug = "nezarazeno"
        subj_id = conn.execute(
            sa.text("SELECT id FROM subject WHERE slug = :slug"),
            {"slug": target_slug},
        ).scalar()
        if subj_id is None:
            subj_id = nezarazeno_id
        conn.execute(
            sa.text("UPDATE session SET subject_id = :sid WHERE id = :sess_id"),
            {"sid": subj_id, "sess_id": sess_id},
        )

    # 6. New index (check if exists first)
    existing_indexes = {
        r[1] for r in conn.execute(sa.text("PRAGMA index_list('package')")).fetchall()
    }
    if "ix_package_subjectid_grade_status" not in existing_indexes:
        op.create_index(
            "ix_package_subjectid_grade_status",
            "package",
            ["subject_id", "grade", "status"],
        )


def downgrade() -> None:
    op.drop_index("ix_package_subjectid_grade_status", table_name="package")
    with op.batch_alter_table("session") as batch_op:
        batch_op.drop_column("subject_id")
    with op.batch_alter_table("package") as batch_op:
        batch_op.drop_column("subject_id")
    op.drop_table("subject")
