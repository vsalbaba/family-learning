"""Tests for Subject model and subject_service resolution logic."""

import pytest
from sqlalchemy.orm import Session

from app.models.subject import Subject
from app.services.subject_service import (
    get_default_subject,
    get_subject_by_slug,
    list_active_subjects,
    normalize_text,
    resolve_subject,
    resolve_subject_or_default,
)


class TestNormalizeText:
    def test_strips_whitespace(self):
        assert normalize_text("  Matematika  ") == "matematika"

    def test_lowercases(self):
        assert normalize_text("MATEMATIKA") == "matematika"

    def test_removes_diacritics(self):
        assert normalize_text("Čeština") == "cestina"
        assert normalize_text("Přírodověda") == "prirodoveda"
        assert normalize_text("Angličtina") == "anglictina"

    def test_replaces_hyphens_and_underscores(self):
        assert normalize_text("cesky-jazyk") == "cesky jazyk"
        assert normalize_text("cesky_jazyk") == "cesky jazyk"

    def test_collapses_whitespace(self):
        assert normalize_text("cesky   jazyk") == "cesky jazyk"


class TestResolveSubject:
    def test_known_mapping(self, db_session: Session):
        subj = resolve_subject(db_session, "český jazyk")
        assert subj is not None
        assert subj.slug == "cestina"

    def test_known_mapping_with_diacritics(self, db_session: Session):
        subj = resolve_subject(db_session, "angličtina")
        assert subj is not None
        assert subj.slug == "anglictina"

    def test_slug_match(self, db_session: Session):
        subj = resolve_subject(db_session, "matematika")
        assert subj is not None
        assert subj.slug == "matematika"

    def test_name_match_case_insensitive(self, db_session: Session):
        subj = resolve_subject(db_session, "Matematika")
        assert subj is not None
        assert subj.slug == "matematika"

    def test_unknown_returns_none(self, db_session: Session):
        assert resolve_subject(db_session, "neznamy_predmet_xyz") is None

    def test_empty_returns_none(self, db_session: Session):
        assert resolve_subject(db_session, "") is None
        assert resolve_subject(db_session, None) is None
        assert resolve_subject(db_session, "   ") is None

    def test_legacy_test_maps_to_nezarazeno(self, db_session: Session):
        subj = resolve_subject(db_session, "Test")
        assert subj is not None
        assert subj.slug == "nezarazeno"


class TestResolveSubjectOrDefault:
    def test_known_text(self, db_session: Session):
        subj = resolve_subject_or_default(db_session, "matematika")
        assert subj.slug == "matematika"

    def test_unknown_text_returns_nezarazeno(self, db_session: Session):
        subj = resolve_subject_or_default(db_session, "neznamy_predmet")
        assert subj.slug == "nezarazeno"

    def test_none_returns_nezarazeno(self, db_session: Session):
        subj = resolve_subject_or_default(db_session, None)
        assert subj.slug == "nezarazeno"

    def test_empty_returns_nezarazeno(self, db_session: Session):
        subj = resolve_subject_or_default(db_session, "")
        assert subj.slug == "nezarazeno"


class TestGetSubjectBySlug:
    def test_existing_slug(self, db_session: Session):
        subj = get_subject_by_slug(db_session, "matematika")
        assert subj is not None
        assert subj.name == "Matematika"

    def test_missing_slug(self, db_session: Session):
        assert get_subject_by_slug(db_session, "nonexistent") is None


class TestGetDefaultSubject:
    def test_returns_nezarazeno(self, db_session: Session):
        subj = get_default_subject(db_session)
        assert subj.slug == "nezarazeno"
        assert subj.name == "Nezařazeno"


class TestListActiveSubjects:
    def test_returns_sorted(self, db_session: Session):
        subjects = list_active_subjects(db_session)
        assert len(subjects) == 7
        assert subjects[0].slug == "cestina"
        assert subjects[-1].slug == "nezarazeno"

    def test_excludes_inactive(self, db_session: Session):
        inactive = db_session.query(Subject).filter_by(slug="vlastiveda").one()
        inactive.is_active = False
        db_session.commit()
        subjects = list_active_subjects(db_session)
        assert len(subjects) == 6
        assert all(s.slug != "vlastiveda" for s in subjects)
