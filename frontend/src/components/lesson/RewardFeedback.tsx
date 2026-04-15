import type { RewardInfo } from "../../types/lesson";
import TokenIcon from "../common/TokenIcon";

interface Props {
  reward: RewardInfo;
}

export default function RewardFeedback({ reward }: Props) {
  return (
    <div className="reward-feedback">
      <span
        className={`reward-progress-gain ${
          reward.is_streak_bonus
            ? "reward-progress-gain--streak"
            : "reward-progress-gain--normal"
        }`}
      >
        +{reward.progress_gained} %
      </span>
      {reward.new_streak >= 2 && (
        <span className="reward-streak-badge">
          Serie: {reward.new_streak}
        </span>
      )}
      {reward.token_earned && (
        <span className="reward-token-earned">
          <TokenIcon size={22} />
          Novy zeton!
        </span>
      )}
    </div>
  );
}
