from dataclasses import dataclass

from app.models.user import User

NORMAL_PROGRESS = 3
STREAK_BONUS_PROGRESS = 5
STREAK_THRESHOLD = 5
PROGRESS_MAX = 100


@dataclass
class RewardDelta:
    progress_gained: int  # 0, 3, or 5
    is_streak_bonus: bool  # True if streak >= 5 at time of answer
    new_streak: int  # streak after this answer
    token_earned: bool  # True if progress crossed 100
    progress: int  # absolute new progress (0-99)
    streak: int  # same as new_streak
    game_tokens: int  # absolute new token count


def process_answer_reward(user: User, is_correct: bool) -> RewardDelta:
    """Apply reward rules to user. Mutates user fields. Caller must db.commit()."""
    if not is_correct:
        user.reward_streak = 0
        return RewardDelta(
            progress_gained=0,
            is_streak_bonus=False,
            new_streak=0,
            token_earned=False,
            progress=user.reward_progress,
            streak=0,
            game_tokens=user.game_tokens,
        )

    # Correct answer
    is_streak_bonus = user.reward_streak >= STREAK_THRESHOLD
    progress_gained = STREAK_BONUS_PROGRESS if is_streak_bonus else NORMAL_PROGRESS

    user.reward_streak += 1
    user.reward_progress += progress_gained

    token_earned = False
    if user.reward_progress >= PROGRESS_MAX:
        user.game_tokens += 1
        user.reward_progress = 0  # excess does NOT carry over
        token_earned = True

    return RewardDelta(
        progress_gained=progress_gained,
        is_streak_bonus=is_streak_bonus,
        new_streak=user.reward_streak,
        token_earned=token_earned,
        progress=user.reward_progress,
        streak=user.reward_streak,
        game_tokens=user.game_tokens,
    )
