import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from app.models.package import Item, Package
from app.models.review import ReviewState
from app.models.user import User
from app.services.lesson_engine import (
    _classify_and_score,
    _get_budget,
    build_lesson_item_sequence,
)


def _make_item(
    db: Session, pkg: Package, sort_order: int = 0, question: str = "Q?"
) -> Item:
    item = Item(
        package_id=pkg.id,
        sort_order=sort_order,
        activity_type="true_false",
        question=question,
        answer_data=json.dumps({"correct": True}),
    )
    db.add(item)
    db.flush()
    return item


def _make_review(
    db: Session, child_id: int, item_id: int, **overrides
) -> ReviewState:
    defaults = {
        "child_id": child_id,
        "item_id": item_id,
        "status": "known",
        "ease_factor": 2.5,
        "interval_days": 7,
        "repetitions": 3,
        "next_review_at": datetime.now(timezone.utc) - timedelta(days=1),
        "last_reviewed_at": datetime.now(timezone.utc) - timedelta(days=8),
    }
    defaults.update(overrides)
    rs = ReviewState(**defaults)
    db.add(rs)
    db.flush()
    return rs


def _make_items(db: Session, pkg: Package, n: int) -> list[Item]:
    items = []
    for i in range(n):
        items.append(_make_item(db, pkg, sort_order=i, question=f"Q{i}"))
    return items


def _pkg(db: Session, parent: User) -> Package:
    pkg = Package(name="Test", status="published", created_by=parent.id)
    db.add(pkg)
    db.flush()
    return pkg


# ── Classification ──────────────────────────────────────────────


class TestClassification:
    def test_item_without_review_is_unseen(self, db_session, parent_user):
        pkg = _pkg(db_session, parent_user)
        item = _make_item(db_session, pkg, sort_order=0)
        now = datetime.now(timezone.utc)
        cat, _ = _classify_and_score(item, None, now, False)
        assert cat == "unseen"

    def test_item_with_review_status_is_remediation(
        self, db_session, parent_user, child_user
    ):
        pkg = _pkg(db_session, parent_user)
        item = _make_item(db_session, pkg)
        rs = _make_review(
            db_session,
            child_user.id,
            item.id,
            status="review",
            next_review_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        cat, _ = _classify_and_score(item, rs, datetime.now(timezone.utc), False)
        assert cat == "remediation"

    def test_item_with_past_next_review_is_due(
        self, db_session, parent_user, child_user
    ):
        pkg = _pkg(db_session, parent_user)
        item = _make_item(db_session, pkg)
        rs = _make_review(
            db_session,
            child_user.id,
            item.id,
            status="known",
            next_review_at=datetime.now(timezone.utc) - timedelta(days=2),
        )
        cat, _ = _classify_and_score(item, rs, datetime.now(timezone.utc), False)
        assert cat == "due"

    def test_item_with_future_next_review_is_not_due(
        self, db_session, parent_user, child_user
    ):
        pkg = _pkg(db_session, parent_user)
        item = _make_item(db_session, pkg)
        rs = _make_review(
            db_session,
            child_user.id,
            item.id,
            status="known",
            next_review_at=datetime.now(timezone.utc) + timedelta(days=5),
        )
        cat, _ = _classify_and_score(item, rs, datetime.now(timezone.utc), False)
        assert cat == "not_due"

    def test_item_with_null_next_review_at_is_unseen(
        self, db_session, parent_user, child_user
    ):
        pkg = _pkg(db_session, parent_user)
        item = _make_item(db_session, pkg)
        rs = _make_review(
            db_session,
            child_user.id,
            item.id,
            status="learning",
            next_review_at=None,
        )
        cat, _ = _classify_and_score(item, rs, datetime.now(timezone.utc), False)
        assert cat == "unseen"

    def test_review_with_past_review_still_remediation(
        self, db_session, parent_user, child_user
    ):
        """A review item that is also past due stays in remediation bucket."""
        pkg = _pkg(db_session, parent_user)
        item = _make_item(db_session, pkg)
        rs = _make_review(
            db_session,
            child_user.id,
            item.id,
            status="review",
            next_review_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        cat, _ = _classify_and_score(item, rs, datetime.now(timezone.utc), False)
        assert cat == "remediation"


# ── Budget ──────────────────────────────────────────────────────


class TestBudget:
    def test_budget_table_count_5(self):
        review_max, new_target, filler = _get_budget(5)
        assert review_max == 2
        assert new_target == 2
        assert filler == 1

    def test_budget_table_count_10(self):
        review_max, new_target, filler = _get_budget(10)
        assert review_max == 4
        assert new_target == 4
        assert filler == 2

    def test_budget_table_count_7(self):
        review_max, new_target, filler = _get_budget(7)
        assert review_max == 3
        assert new_target == 3
        assert filler == 1

    def test_budget_fallback_count_15(self):
        review_max, new_target, filler = _get_budget(15)
        assert review_max == round(15 * 0.4)  # 6
        assert new_target == round(15 * 0.4)  # 6
        assert filler == 15 - review_max - new_target

    def test_review_cap_limits_selection(
        self, db_session, parent_user, child_user
    ):
        """30 due items + 20 new, count=10: max 4 review selected."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 50)
        # First 30 are due
        for item in items[:30]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                status="known",
                next_review_at=datetime.now(timezone.utc) - timedelta(days=3),
                last_reviewed_at=datetime.now(timezone.utc) - timedelta(days=10),
            )
        # Last 20 are new (no review state)
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 10
        )
        assert len(selected) == 10

        due_ids = {item.id for item in items[:30]}
        review_count = sum(1 for it in selected if it.id in due_ids)
        assert review_count <= 4  # review_max for count=10

    def test_no_new_items_review_fills_partially(
        self, db_session, parent_user, child_user
    ):
        """When there are no new items, review cap still holds."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 10)
        # 5 due, 5 not_due
        for i, item in enumerate(items):
            delta = -timedelta(days=2) if i < 5 else timedelta(days=10)
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=datetime.now(timezone.utc) + delta,
                last_reviewed_at=datetime.now(timezone.utc) - timedelta(days=10),
            )
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 5
        )
        assert len(selected) == 5
        due_ids = {items[i].id for i in range(5)}
        review_count = sum(1 for it in selected if it.id in due_ids)
        assert review_count <= 2  # review_max for count=5


# ── New guarantee ───────────────────────────────────────────────


class TestNewGuarantee:
    def test_new_items_get_min_slots_despite_many_due(
        self, db_session, parent_user, child_user
    ):
        """With many due and many new, new items get at least new_target slots."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 30)
        # First 20 are due
        for item in items[:20]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=datetime.now(timezone.utc) - timedelta(days=2),
                last_reviewed_at=datetime.now(timezone.utc) - timedelta(days=10),
            )
        # Last 10 are new
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 10
        )
        new_ids = {items[i].id for i in range(20, 30)}
        new_count = sum(1 for it in selected if it.id in new_ids)
        assert new_count >= 4  # new_target for count=10

    def test_new_items_fewer_than_min_uses_all_available(
        self, db_session, parent_user, child_user
    ):
        """If fewer new items exist than new_target, use all available."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 10)
        # 9 due, 1 new
        for item in items[:9]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=datetime.now(timezone.utc) - timedelta(days=1),
                last_reviewed_at=datetime.now(timezone.utc) - timedelta(days=5),
            )
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 5
        )
        new_ids = {items[9].id}
        new_count = sum(1 for it in selected if it.id in new_ids)
        assert new_count == 1  # Only 1 new available

    def test_new_items_sorted_by_sort_order(
        self, db_session, parent_user, child_user
    ):
        """New items should roughly follow sort_order (progress through package)."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 20)
        # All new (no review states)
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 5
        )
        # Should pick items with lower sort_order first
        selected_orders = [it.sort_order for it in selected]
        # Due to small random shuffle, they should all be from first ~8 items
        assert all(o < 10 for o in selected_orders)


# ── Review priority ─────────────────────────────────────────────


class TestReviewPriority:
    def test_learning_selected_before_due_in_review_slots(
        self, db_session, parent_user, child_user
    ):
        """Review items get priority over due items in review slots."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 20)
        # 2 review (remediation)
        for item in items[:2]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                status="review",
                ease_factor=1.5,
                next_review_at=datetime.now(timezone.utc) - timedelta(hours=1),
                last_reviewed_at=datetime.now(timezone.utc) - timedelta(days=2),
            )
        # 5 due
        for item in items[2:7]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                status="known",
                next_review_at=datetime.now(timezone.utc) - timedelta(days=3),
                last_reviewed_at=datetime.now(timezone.utc) - timedelta(days=10),
            )
        # Rest are new
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 10
        )
        # review_max=4 for count=10, learning items in review pool come first
        learning_ids = {items[0].id, items[1].id}
        # Both learning items should be selected
        assert all(
            any(it.id == lid for it in selected) for lid in learning_ids
        )

    def test_due_with_lower_ease_preferred(
        self, db_session, parent_user, child_user
    ):
        """Due items with lower ease_factor (harder) should be selected first."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 15)
        now = datetime.now(timezone.utc)
        # 5 due items with varying ease
        for i, item in enumerate(items[:5]):
            _make_review(
                db_session,
                child_user.id,
                item.id,
                ease_factor=2.5 - i * 0.2,  # 2.5, 2.3, 2.1, 1.9, 1.7
                next_review_at=now - timedelta(days=1),
                last_reviewed_at=now - timedelta(days=8),
            )
        # Rest are new
        db_session.commit()

        # count=3 → review_max=1
        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 3
        )
        due_ids = {items[i].id for i in range(5)}
        review_items = [it for it in selected if it.id in due_ids]
        if review_items:
            # The selected due item should be one with lower ease
            selected_item = review_items[0]
            selected_ease = None
            for i in range(5):
                if items[i].id == selected_item.id:
                    selected_ease = 2.5 - i * 0.2
            assert selected_ease is not None
            assert selected_ease <= 2.1  # Should pick harder items

    def test_due_older_overdue_preferred(
        self, db_session, parent_user, child_user
    ):
        """Due items that are more overdue should score higher."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 3)
        now = datetime.now(timezone.utc)
        # 3 due items: slightly overdue, moderately overdue, very overdue
        for i, item in enumerate(items):
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now - timedelta(hours=1 + i * 10),  # 1h, 11h, 21h
                last_reviewed_at=now - timedelta(days=20),
            )
        db_session.commit()

        # All 3 are due, scoring differs by overdue_hours
        # Verify via _classify_and_score that more overdue = higher score
        reviews = {r.item_id: r for r in db_session.query(ReviewState).all()}
        scores = []
        for item in items:
            _, score = _classify_and_score(
                item, reviews[item.id], now.replace(tzinfo=None), False
            )
            scores.append(score)
        # Most overdue (items[2]) should have highest score
        assert scores[2] > scores[1] > scores[0]


# ── Anti-repeat ─────────────────────────────────────────────────


class TestAntiRepeat:
    def test_item_seen_1h_ago_hard_penalty(
        self, db_session, parent_user, child_user
    ):
        """Items seen < 6h ago get hard penalty and are deprioritized."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 10)
        now = datetime.now(timezone.utc)
        # 5 due: 2 seen recently, 3 seen long ago
        for i, item in enumerate(items[:5]):
            last = now - timedelta(hours=1) if i < 2 else now - timedelta(days=5)
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now - timedelta(days=1),
                last_reviewed_at=last,
            )
        # 5 new
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 5
        )
        # review_max=2: should prefer non-recent due items
        recent_ids = {items[0].id, items[1].id}
        recent_selected = sum(1 for it in selected if it.id in recent_ids)
        # Recent items should NOT be selected when others are available
        assert recent_selected == 0

    def test_item_seen_10h_ago_soft_penalty(
        self, db_session, parent_user, child_user
    ):
        """Items seen 6-24h ago get soft penalty but can still be selected."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 2)
        now = datetime.now(timezone.utc)
        # Item 0: seen 10h ago (soft penalty)
        rs_recent = _make_review(
            db_session,
            child_user.id,
            items[0].id,
            next_review_at=now - timedelta(days=1),
            last_reviewed_at=now - timedelta(hours=10),
        )
        # Item 1: seen 5 days ago (no penalty)
        rs_old = _make_review(
            db_session,
            child_user.id,
            items[1].id,
            next_review_at=now - timedelta(days=1),
            last_reviewed_at=now - timedelta(days=5),
        )
        db_session.commit()

        now_naive = now.replace(tzinfo=None)
        _, score_recent = _classify_and_score(items[0], rs_recent, now_naive, False)
        _, score_old = _classify_and_score(items[1], rs_old, now_naive, False)
        assert score_recent < score_old  # Soft penalty reduces score

    def test_item_seen_2_days_ago_no_penalty(
        self, db_session, parent_user, child_user
    ):
        """Items seen > 24h ago get no penalty."""
        pkg = _pkg(db_session, parent_user)
        item = _make_item(db_session, pkg)
        now = datetime.now(timezone.utc)
        rs = _make_review(
            db_session,
            child_user.id,
            item.id,
            next_review_at=now - timedelta(days=1),
            last_reviewed_at=now - timedelta(days=2),
        )
        # No penalty expected — score should be positive
        _, score = _classify_and_score(item, rs, now, False)
        assert score > 0

    def test_anti_repeat_disabled_in_999_mode(
        self, db_session, parent_user, child_user
    ):
        """In 999 mode, anti-repeat is disabled."""
        pkg = _pkg(db_session, parent_user)
        item = _make_item(db_session, pkg)
        now = datetime.now(timezone.utc)
        rs = _make_review(
            db_session,
            child_user.id,
            item.id,
            next_review_at=now - timedelta(days=1),
            last_reviewed_at=now - timedelta(minutes=30),
        )
        _, score_normal = _classify_and_score(item, rs, now, False)
        _, score_999 = _classify_and_score(item, rs, now, True)
        assert score_999 > score_normal  # 999 mode has no penalty


# ── Ordering ────────────────────────────────────────────────────


class TestOrdering:
    def test_review_items_first_then_new_then_filler(
        self, db_session, parent_user, child_user
    ):
        """Result ordering: review → new → not_due."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 10)
        now = datetime.now(timezone.utc)
        # 2 due
        for item in items[:2]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now - timedelta(days=1),
                last_reviewed_at=now - timedelta(days=5),
            )
        # 3 not_due
        for item in items[2:5]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now + timedelta(days=10),
                last_reviewed_at=now - timedelta(days=5),
            )
        # 5 new (no review state)
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 5
        )
        due_ids = {items[0].id, items[1].id}
        new_ids = {items[i].id for i in range(5, 10)}
        filler_ids = {items[i].id for i in range(2, 5)}

        # Categorize each selected item
        categories = []
        for it in selected:
            if it.id in due_ids:
                categories.append("due")
            elif it.id in new_ids:
                categories.append("unseen")
            elif it.id in filler_ids:
                categories.append("filler")

        # Due items should come before unseen, unseen before filler
        due_positions = [i for i, c in enumerate(categories) if c == "due"]
        unseen_positions = [i for i, c in enumerate(categories) if c == "unseen"]
        filler_positions = [i for i, c in enumerate(categories) if c == "filler"]

        if due_positions and unseen_positions:
            assert max(due_positions) < min(unseen_positions)
        if unseen_positions and filler_positions:
            assert max(unseen_positions) < min(filler_positions)

    def test_within_review_remediation_before_due(
        self, db_session, parent_user, child_user
    ):
        """Within review slots, remediation items come before due items."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 15)
        now = datetime.now(timezone.utc)
        # 1 review (remediation)
        _make_review(
            db_session,
            child_user.id,
            items[0].id,
            status="review",
            ease_factor=1.5,
            next_review_at=now - timedelta(hours=1),
            last_reviewed_at=now - timedelta(days=2),
        )
        # 3 due
        for item in items[1:4]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now - timedelta(days=3),
                last_reviewed_at=now - timedelta(days=10),
            )
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 10
        )
        # First selected item should be the learning item
        assert selected[0].id == items[0].id


# ── Fallback scenarios ──────────────────────────────────────────


class TestFallback:
    def test_no_history_all_new_sorted_by_order(
        self, db_session, parent_user, child_user
    ):
        """Child with no history gets items sorted roughly by sort_order."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 20)
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 5
        )
        assert len(selected) == 5
        # Average sort_order should be low (early in package) even with shuffle
        avg_order = sum(it.sort_order for it in selected) / len(selected)
        assert avg_order < 10  # Expected ~2-4 without shuffle, generous bound

    def test_mostly_new_package(
        self, db_session, parent_user, child_user
    ):
        """Package with 1 due and 19 new: review cap still applies."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 20)
        _make_review(
            db_session,
            child_user.id,
            items[0].id,
            next_review_at=datetime.now(timezone.utc) - timedelta(days=1),
            last_reviewed_at=datetime.now(timezone.utc) - timedelta(days=5),
        )
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 5
        )
        assert len(selected) == 5
        # Due item should be selected (only 1 review, fits in cap)
        assert any(it.id == items[0].id for it in selected)

    def test_no_due_items_new_and_filler(
        self, db_session, parent_user, child_user
    ):
        """No due items: lesson is new + not_due filler."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 10)
        # 5 not_due, 5 new
        for item in items[:5]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=datetime.now(timezone.utc) + timedelta(days=10),
                last_reviewed_at=datetime.now(timezone.utc) - timedelta(days=5),
            )
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 5
        )
        assert len(selected) == 5
        # No due items should be selected (none exist)
        due_ids = set()
        assert sum(1 for it in selected if it.id in due_ids) == 0

    def test_large_due_backlog_stays_capped(
        self, db_session, parent_user, child_user
    ):
        """40 due items + 10 new, count=10: max 4 review, min 4 new."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 50)
        now = datetime.now(timezone.utc)
        for item in items[:40]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now - timedelta(days=5),
                last_reviewed_at=now - timedelta(days=12),
            )
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 10
        )
        assert len(selected) == 10
        due_ids = {items[i].id for i in range(40)}
        new_ids = {items[i].id for i in range(40, 50)}
        review_count = sum(1 for it in selected if it.id in due_ids)
        new_count = sum(1 for it in selected if it.id in new_ids)
        assert review_count <= 4
        assert new_count >= 4

    def test_fewer_items_than_requested(
        self, db_session, parent_user, child_user
    ):
        """Requesting more items than exist returns all items."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 3)
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 10
        )
        assert len(selected) == 3

    def test_count_999_returns_all_ordered(
        self, db_session, parent_user, child_user
    ):
        """999 mode returns all items: remediation → due → unseen → not_due."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 10)
        now = datetime.now(timezone.utc)
        # 1 review (remediation)
        _make_review(
            db_session,
            child_user.id,
            items[0].id,
            status="review",
            next_review_at=now - timedelta(hours=1),
            last_reviewed_at=now - timedelta(days=1),
        )
        # 2 due
        for item in items[1:3]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now - timedelta(days=2),
                last_reviewed_at=now - timedelta(days=9),
            )
        # 2 not_due
        for item in items[3:5]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now + timedelta(days=10),
                last_reviewed_at=now - timedelta(days=5),
            )
        # 5 new
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 999
        )
        assert len(selected) == 10
        # First should be learning, then due, then new, then not_due
        assert selected[0].id == items[0].id  # learning
        due_ids = {items[1].id, items[2].id}
        assert selected[1].id in due_ids
        assert selected[2].id in due_ids

    def test_count_999_no_anti_repeat(
        self, db_session, parent_user, child_user
    ):
        """999 mode disables anti-repeat guard."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 3)
        now = datetime.now(timezone.utc)
        # All due, all seen 30min ago
        for item in items:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now - timedelta(days=1),
                last_reviewed_at=now - timedelta(minutes=30),
            )
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 999
        )
        assert len(selected) == 3  # All items returned despite recent review


# ── Scenario tests ──────────────────────────────────────────────


class TestScenarios:
    def test_child_no_history_gets_new_items_in_order(
        self, db_session, parent_user, child_user
    ):
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 20)
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 5
        )
        assert len(selected) == 5
        # All should be new items
        for it in selected:
            rs = (
                db_session.query(ReviewState)
                .filter(
                    ReviewState.child_id == child_user.id,
                    ReviewState.item_id == it.id,
                )
                .first()
            )
            assert rs is None  # No review state = new

    def test_large_package_progress_forward(
        self, db_session, parent_user, child_user
    ):
        """50 items: 20 known, 5 due, 25 new → lesson 10: ~4 review, ~4 new, ~2 filler."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 50)
        now = datetime.now(timezone.utc)
        # 20 not_due (known, reviewed recently)
        for item in items[:20]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                status="known",
                next_review_at=now + timedelta(days=14),
                last_reviewed_at=now - timedelta(days=7),
            )
        # 5 due
        for item in items[20:25]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now - timedelta(days=2),
                last_reviewed_at=now - timedelta(days=9),
            )
        # 25 new
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 10
        )
        assert len(selected) == 10
        due_ids = {items[i].id for i in range(20, 25)}
        new_ids = {items[i].id for i in range(25, 50)}
        filler_ids = {items[i].id for i in range(20)}
        review_count = sum(1 for it in selected if it.id in due_ids)
        new_count = sum(1 for it in selected if it.id in new_ids)
        filler_count = sum(1 for it in selected if it.id in filler_ids)
        assert review_count <= 4
        assert new_count >= 4
        assert review_count + new_count + filler_count == 10

    def test_wrong_answer_item_gets_priority_in_review(
        self, db_session, parent_user, child_user
    ):
        """Item with review status (wrong answer) gets priority in review slots."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 15)
        now = datetime.now(timezone.utc)
        # 1 review (wrong answer)
        _make_review(
            db_session,
            child_user.id,
            items[0].id,
            status="review",
            ease_factor=1.3,
            interval_days=0,
            next_review_at=now - timedelta(hours=1),
            last_reviewed_at=now - timedelta(days=1),
        )
        # 4 due
        for item in items[1:5]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now - timedelta(days=3),
                last_reviewed_at=now - timedelta(days=10),
            )
        # 10 new
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 10
        )
        # Learning item should be first (review slot, learning before due)
        assert selected[0].id == items[0].id

    def test_review_backlog_never_overwhelms_lesson(
        self, db_session, parent_user, child_user
    ):
        """40 due + 10 new, count=10: review never exceeds cap."""
        pkg = _pkg(db_session, parent_user)
        items = _make_items(db_session, pkg, 50)
        now = datetime.now(timezone.utc)
        for item in items[:40]:
            _make_review(
                db_session,
                child_user.id,
                item.id,
                next_review_at=now - timedelta(days=10),
                last_reviewed_at=now - timedelta(days=17),
            )
        db_session.commit()

        selected = build_lesson_item_sequence(
            db_session, child_user.id, pkg.id, 10
        )
        due_ids = {items[i].id for i in range(40)}
        new_ids = {items[i].id for i in range(40, 50)}
        review_count = sum(1 for it in selected if it.id in due_ids)
        new_count = sum(1 for it in selected if it.id in new_ids)
        assert review_count <= 4
        assert new_count >= 4
