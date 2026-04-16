interface Props {
  currentWave: number;
  totalWaves: number;
}

export default function WaveIndicator({ currentWave, totalWaves }: Props) {
  return (
    <div className="fg-wave">
      Vlna {currentWave}/{totalWaves}
    </div>
  );
}
