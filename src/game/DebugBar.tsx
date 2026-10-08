export function DebugBar({
  radiusM,
  canSkip,
  onSkip,
  onAdjust,
}: {
  radiusM: number
  canSkip: boolean
  onSkip: () => void
  onAdjust: (delta: number) => void
}) {
  return (
    <div class="debug-panel" data-marker="PINK_DEBUG">
      <p class="debug-note">დებაგი · რადიუსი {radiusM} მ</p>
      {canSkip && (
        <button type="button" onClick={onSkip}>
          გამოტოვე პუნქტი
        </button>
      )}
      <button type="button" onClick={() => onAdjust(5)}>
        +5 ქულა
      </button>
      <button type="button" onClick={() => onAdjust(-5)}>
        −5 ქულა
      </button>
    </div>
  )
}
