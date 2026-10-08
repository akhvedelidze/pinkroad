export type PauseState = {
  pointId: string
  wrongCount: number
  pauseUntil: number | null
}

export type PauseStore = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const PAUSE_KEY = 'pink-route:pause'

export function emptyPause(pointId: string): PauseState {
  return { pointId, wrongCount: 0, pauseUntil: null }
}

export function judgeTap(distanceM: number, toleranceM: number): 'correct' | 'outside' {
  return distanceM <= toleranceM ? 'correct' : 'outside'
}

export function pauseDurationSec(wrongCount: number, schedule: readonly number[]): number {
  if (schedule.length === 0 || wrongCount < 1) return 0
  return schedule[Math.min(wrongCount - 1, schedule.length - 1)]
}

export function remainingPauseMs(state: PauseState, now: number): number {
  if (state.pauseUntil == null) return 0
  return Math.max(0, state.pauseUntil - now)
}

export function wrongConfirm(state: PauseState, schedule: readonly number[], now: number): PauseState {
  const wrongCount = state.wrongCount + 1
  return {
    pointId: state.pointId,
    wrongCount,
    pauseUntil: now + pauseDurationSec(wrongCount, schedule) * 1000,
  }
}

export function readPause(store: PauseStore, pointId: string): PauseState {
  try {
    const raw = store.getItem(PAUSE_KEY)
    if (!raw) return emptyPause(pointId)
    const parsed = JSON.parse(raw) as Partial<PauseState>
    if (parsed.pointId !== pointId || typeof parsed.wrongCount !== 'number') return emptyPause(pointId)
    return {
      pointId,
      wrongCount: parsed.wrongCount,
      pauseUntil: typeof parsed.pauseUntil === 'number' ? parsed.pauseUntil : null,
    }
  } catch {
    return emptyPause(pointId)
  }
}

export function writePause(store: PauseStore, state: PauseState) {
  try {
    store.setItem(PAUSE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be blocked. The pause still runs in memory until the page closes.
  }
}
