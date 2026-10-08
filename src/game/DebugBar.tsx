export function DebugBar({
  radiusM,
  onAdjust,
}: {
  radiusM: number
  onAdjust: (delta: number) => void
}) {
  return (
    <div class="debug-panel" data-marker="PINK_DEBUG">
      <p class="debug-note">დებაგი · რადიუსი {radiusM} მ</p>
      <button type="button" onClick={() => onAdjust(5)}>
        +5 ქულა
      </button>
      <button type="button" onClick={() => onAdjust(-5)}>
        −5 ქულა
      </button>
    </div>
  )
}
