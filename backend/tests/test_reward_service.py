"""Unit tests for the reward service business logic."""

from types import SimpleNamespace

from app.services.reward_service import process_answer_reward


def _make_user(progress=0, streak=0, tokens=0):
    """Create a minimal user-like object for testing."""
    return SimpleNamespace(
        reward_progress=progress,
        reward_streak=streak,
        game_tokens=tokens,
    )


# --- Streak boundary tests ---


def test_streak_4_gives_normal_progress():
    user = _make_user(progress=0, streak=4)
    delta = process_answer_reward(user, is_correct=True)
    assert delta.progress_gained == 3
    assert delta.is_streak_bonus is False
    assert user.reward_progress == 3
    assert user.reward_streak == 5


def test_streak_5_gives_bonus_progress():
    user = _make_user(progress=0, streak=5)
    delta = process_answer_reward(user, is_correct=True)
    assert delta.progress_gained == 5
    assert delta.is_streak_bonus is True
    assert user.reward_progress == 5
    assert user.reward_streak == 6


def test_streak_6_gives_bonus_progress():
    user = _make_user(progress=0, streak=6)
    delta = process_answer_reward(user, is_correct=True)
    assert delta.progress_gained == 5
    assert delta.is_streak_bonus is True
    assert user.reward_streak == 7


# --- Progress overflow tests ---


def test_progress_97_plus_3_gives_token():
    user = _make_user(progress=97, streak=0, tokens=0)
    delta = process_answer_reward(user, is_correct=True)
    assert delta.token_earned is True
    assert delta.progress == 0
    assert delta.game_tokens == 1
    assert user.reward_progress == 0
    assert user.game_tokens == 1


def test_progress_98_plus_5_gives_token_no_carryover():
    """98 + 5 = 103 >= 100: token earned, progress resets to 0 (NOT 3)."""
    user = _make_user(progress=98, streak=5, tokens=0)
    delta = process_answer_reward(user, is_correct=True)
    assert delta.token_earned is True
    assert delta.progress == 0  # no carryover
    assert delta.game_tokens == 1
    assert user.reward_progress == 0


def test_progress_95_plus_5_gives_token():
    user = _make_user(progress=95, streak=5, tokens=2)
    delta = process_answer_reward(user, is_correct=True)
    assert delta.token_earned is True
    assert delta.progress == 0
    assert delta.game_tokens == 3
    assert user.game_tokens == 3


def test_progress_exactly_100():
    """97 + 3 = 100: token earned, reset to 0."""
    user = _make_user(progress=97, streak=0, tokens=0)
    delta = process_answer_reward(user, is_correct=True)
    assert delta.token_earned is True
    assert delta.progress == 0
    assert delta.game_tokens == 1


def test_no_double_token():
    """Even with high progress, only 1 token per call."""
    user = _make_user(progress=99, streak=5, tokens=0)
    delta = process_answer_reward(user, is_correct=True)
    # 99 + 5 = 104 -> exactly 1 token
    assert delta.token_earned is True
    assert delta.game_tokens == 1
    assert user.game_tokens == 1


# --- Reset tests ---


def test_wrong_resets_streak():
    user = _make_user(progress=50, streak=7, tokens=3)
    delta = process_answer_reward(user, is_correct=False)
    assert delta.new_streak == 0
    assert delta.streak == 0
    assert user.reward_streak == 0


def test_wrong_preserves_progress():
    user = _make_user(progress=42, streak=3)
    delta = process_answer_reward(user, is_correct=False)
    assert delta.progress == 42
    assert delta.progress_gained == 0
    assert user.reward_progress == 42


def test_wrong_preserves_tokens():
    user = _make_user(progress=50, streak=5, tokens=3)
    delta = process_answer_reward(user, is_correct=False)
    assert delta.game_tokens == 3
    assert user.game_tokens == 3


# --- Accumulation tests ---


def test_consecutive_correct_accumulates_progress():
    user = _make_user()
    process_answer_reward(user, is_correct=True)
    assert user.reward_progress == 3
    process_answer_reward(user, is_correct=True)
    assert user.reward_progress == 6
    process_answer_reward(user, is_correct=True)
    assert user.reward_progress == 9


def test_streak_increments_each_correct():
    user = _make_user()
    for i in range(1, 4):
        process_answer_reward(user, is_correct=True)
        assert user.reward_streak == i


# --- Edge cases ---


def test_fresh_user_defaults():
    user = _make_user()
    delta = process_answer_reward(user, is_correct=True)
    assert delta.progress_gained == 3
    assert delta.is_streak_bonus is False
    assert delta.new_streak == 1
    assert delta.token_earned is False
    assert delta.progress == 3
    assert delta.game_tokens == 0


def test_wrong_on_fresh_user():
    user = _make_user()
    delta = process_answer_reward(user, is_correct=False)
    assert delta.progress_gained == 0
    assert delta.new_streak == 0
    assert delta.token_earned is False
    assert user.reward_progress == 0
    assert user.reward_streak == 0
    assert user.game_tokens == 0


def test_streak_boundary_transition():
    """Build streak from 0 to 6, verify transition at boundary."""
    user = _make_user()
    for i in range(5):
        delta = process_answer_reward(user, is_correct=True)
        assert delta.progress_gained == 3, f"Answer {i+1} should give +3"
        assert delta.is_streak_bonus is False
    # 6th answer: streak is now 5, should get bonus
    delta = process_answer_reward(user, is_correct=True)
    assert delta.progress_gained == 5
    assert delta.is_streak_bonus is True
    assert user.reward_streak == 6
    # Total: 5*3 + 5 = 20
    assert user.reward_progress == 20
