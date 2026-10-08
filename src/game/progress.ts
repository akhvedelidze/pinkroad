import { emptyPause, wrongConfirm, type PauseState, type PauseStore } from './confirm.ts'

export const GAME_KEY = 'pink-route:game'

export type Team = {
  code: string
  name: string
}

export type GameState = {
  startedAt: number
  pointId: string
  completedIds: string[]
  score: number
  locationWrong: number
  taskWrong: number
  opened: boolean
  locationScored: boolean
  solvedPointId: string | null
  questionIndex: number
  finished: boolean
  finishedElapsedSec: number | null
  attempt: number
  team: Team | null
  pause: PauseState
}

export function freshGame(pointId: string, now: number): GameState {
  return {
    startedAt: now,
    pointId,
    completedIds: [],
    score: 0,
    locationWrong: 0,
    taskWrong: 0,
    opened: false,
    locationScored: false,
    solvedPointId: null,
    questionIndex: 0,
    finished: false,
    finishedElapsedSec: null,
    attempt: 1,
    team: null,
    pause: emptyPause(pointId),
  }
}

export function pointsForAttempt(wrongsBeforeSuccess: number, table: readonly number[]): number {
  if (table.length === 0 || wrongsBeforeSuccess < 0) return 0
  const index = Math.min(wrongsBeforeSuccess, table.length - 1)
  return Math.max(0, table[index] ?? 0)
}

export function addScore(score: number, gain: number, minScore: number): number {
  return Math.max(minScore, score + Math.max(0, gain))
}

export function progressLabel(order: number, total: number, finished: boolean): string {
  if (total < 1) return '0/0'
  if (finished) return `${total}/${total}`
  return `${Math.min(total, Math.max(1, order))}/${total}`
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function awardLocation(
  state: GameState,
  table: readonly number[],
  minScore: number,
  questionIndex: number,
): GameState {
  if (state.opened || state.finished) return state
  const gain = state.locationScored ? 0 : pointsForAttempt(state.locationWrong, table)
  return {
    ...state,
    opened: true,
    locationScored: true,
    questionIndex,
    score: addScore(state.score, gain, minScore),
  }
}

export function noteWrongLocation(state: GameState, schedule: readonly number[], now: number): GameState {
  if (state.opened || state.finished) return state
  return {
    ...state,
    locationWrong: state.locationWrong + 1,
    pause: wrongConfirm(state.pause, schedule, now),
  }
}

export function noteWrongTask(state: GameState): GameState {
  if (!state.opened || state.finished || state.solvedPointId === state.pointId) return state
  return { ...state, taskWrong: state.taskWrong + 1 }
}

export function awardTask(state: GameState, table: readonly number[], minScore: number): GameState {
  if (!state.opened || state.finished || state.solvedPointId === state.pointId) return state
  return {
    ...state,
    score: addScore(state.score, pointsForAttempt(state.taskWrong, table), minScore),
    solvedPointId: state.pointId,
    completedIds: state.completedIds.includes(state.pointId)
      ? state.completedIds
      : [...state.completedIds, state.pointId],
  }
}

export function adjustScore(state: GameState, delta: number, minScore: number): GameState {
  return { ...state, score: Math.max(minScore, state.score + delta) }
}

export function skipPoint(state: GameState, nextPointId: string | null, elapsedSec: number): GameState {
  if (state.finished) return state
  const completedIds = state.completedIds.includes(state.pointId)
    ? state.completedIds
    : [...state.completedIds, state.pointId]
  if (!nextPointId) {
    return {
      ...state,
      completedIds,
      finished: true,
      opened: false,
      solvedPointId: null,
      locationScored: false,
      finishedElapsedSec: Math.max(0, Math.floor(elapsedSec)),
      pause: emptyPause(state.pointId),
    }
  }
  return {
    ...state,
    completedIds,
    pointId: nextPointId,
    opened: false,
    locationScored: false,
    solvedPointId: null,
    locationWrong: 0,
    taskWrong: 0,
    questionIndex: 0,
    finishedElapsedSec: null,
    pause: emptyPause(nextPointId),
  }
}

export function retry(state: GameState, firstPointId: string, now: number): GameState {
  if (!state.finished || !state.team) return state
  return {
    ...freshGame(firstPointId, now),
    team: state.team,
    attempt: state.attempt + 1,
  }
}

export function assignTeam(state: GameState, team: Team): GameState {
  const parsed = parseTeam(team.code, team.name)
  if (!parsed) return state
  return { ...state, team: parsed }
}

export function advance(state: GameState, nextPointId: string | null, elapsedSec = 0): GameState {
  if (state.solvedPointId !== state.pointId || state.finished) return state
  if (!nextPointId) {
    return {
      ...state,
      finished: true,
      opened: false,
      finishedElapsedSec: Math.max(0, Math.floor(elapsedSec)),
    }
  }
  return {
    ...state,
    pointId: nextPointId,
    opened: false,
    locationScored: false,
    solvedPointId: null,
    locationWrong: 0,
    taskWrong: 0,
    questionIndex: 0,
    finishedElapsedSec: null,
    pause: emptyPause(nextPointId),
  }
}

export function loadGame(
  store: PauseStore,
  routeIds: readonly string[],
  now: number,
): { state: GameState; warning: boolean } {
  const first = routeIds[0] ?? 'p01'
  try {
    const raw = store.getItem(GAME_KEY)
    if (!raw) return { state: freshGame(first, now), warning: false }
    return { state: normalize(JSON.parse(raw), routeIds, now), warning: false }
  } catch {
    return { state: freshGame(first, now), warning: true }
  }
}

export function saveGame(store: PauseStore, state: GameState): boolean {
  try {
    store.setItem(GAME_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

function normalize(value: unknown, routeIds: readonly string[], now: number): GameState {
  const first = routeIds[0] ?? 'p01'
  const fresh = freshGame(first, now)
  if (!value || typeof value !== 'object') return fresh
  const raw = value as Partial<GameState>
  const pointId = typeof raw.pointId === 'string' && routeIds.includes(raw.pointId) ? raw.pointId : first
  const completedIds = Array.isArray(raw.completedIds)
    ? raw.completedIds.filter((id): id is string => typeof id === 'string' && routeIds.includes(id))
    : []
  const pause = raw.pause
  const pauseOk =
    pause != null &&
    pause.pointId === pointId &&
    typeof pause.wrongCount === 'number' &&
    (pause.pauseUntil == null || typeof pause.pauseUntil === 'number')
  return {
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : now,
    pointId,
    completedIds,
    score: typeof raw.score === 'number' && raw.score > 0 ? raw.score : 0,
    locationWrong: count(raw.locationWrong),
    taskWrong: count(raw.taskWrong),
    opened: raw.opened === true && raw.finished !== true,
    locationScored: raw.locationScored === true,
    solvedPointId: raw.solvedPointId === pointId ? pointId : null,
    questionIndex: count(raw.questionIndex),
    finished: raw.finished === true,
    finishedElapsedSec:
      raw.finished === true && typeof raw.finishedElapsedSec === 'number' && raw.finishedElapsedSec >= 0
        ? Math.floor(raw.finishedElapsedSec)
        : null,
    attempt: readAttempt(raw.attempt),
    team: readTeam(raw.team),
    pause: pauseOk ? pause : emptyPause(pointId),
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && value > 0 ? Math.floor(value) : 0
}

function readAttempt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1
}

function readTeam(value: unknown): Team | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { code?: unknown; name?: unknown }
  if (typeof raw.code !== 'string' || typeof raw.name !== 'string') return null
  return parseTeam(raw.code, raw.name)
}

export function parseTeam(code: string, name: string): Team | null {
  const cleanCode = code.normalize('NFC').trim().toUpperCase()
  const cleanName = name.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!/^[A-Z0-9]{2,12}$/.test(cleanCode)) return null
  if ([...cleanName].length < 2 || [...cleanName].length > 40) return null
  return { code: cleanCode, name: cleanName }
}
