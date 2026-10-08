import { describe, expect, it } from 'vitest'
import points from '../content/points.json'
import config from '../content/config.json'
import {
  addScore,
  advance,
  assignTeam,
  awardLocation,
  awardTask,
  formatElapsed,
  freshGame,
  GAME_KEY,
  loadGame,
  noteWrongLocation,
  noteWrongTask,
  pointsForAttempt,
  progressLabel,
  retry,
  saveGame,
  type GameState,
} from '../src/game/progress.ts'
import type { PauseStore } from '../src/game/confirm.ts'

const location = config.scoring.locationByAttempt
const task = config.scoring.taskByAttempt
const minScore = config.scoring.minPointScore

describe('route length', () => {
  it('uses every saved place instead of stopping at ten', () => {
    expect(points.length).toBeGreaterThan(10)
    expect(progressLabel(3, points.length, false)).toBe(`3/${points.length}`)
    expect(progressLabel(1, points.length, true)).toBe(`${points.length}/${points.length}`)
  })
})

describe('scoring', () => {
  it('pays the first successful location and task attempts, then less', () => {
    let state = freshGame('p01', 1_000)
    state = awardLocation(state, location, minScore, 4)
    expect(state.score).toBe(5)
    expect(state.opened).toBe(true)
    expect(state.questionIndex).toBe(4)

    state = noteWrongTask(state)
    state = awardTask(state, task, minScore)
    expect(state.score).toBe(12)
    expect(state.completedIds).toEqual(['p01'])
    expect(awardTask(state, task, minScore).score).toBe(12)
  })

  it('drops to zero points after repeated misses and never goes negative', () => {
    let state = freshGame('p01', 1_000)
    state = noteWrongLocation(state, config.penalties.wrongConfirmPauseSec, 2_000)
    state = noteWrongLocation(state, config.penalties.wrongConfirmPauseSec, 3_000)
    state = noteWrongLocation(state, config.penalties.wrongConfirmPauseSec, 4_000)
    state = awardLocation(state, location, minScore, 0)
    expect(pointsForAttempt(3, location)).toBe(0)
    expect(state.score).toBe(0)
    expect(addScore(0, -5, 0)).toBe(0)
  })
})

describe('progress storage', () => {
  it('returns to the same point, score, and clock after a reload', () => {
    const memory = memoryStore()
    let state = freshGame('p01', 5_000)
    state = awardLocation(state, location, minScore, 2)
    state = awardTask(state, task, minScore)
    state = advance(state, 'p02')
    expect(saveGame(memory, state)).toBe(true)

    const loaded = loadGame(memory, ['p01', 'p02', 'p03'], 9_000)
    expect(loaded.warning).toBe(false)
    expect(loaded.state.pointId).toBe('p02')
    expect(loaded.state.score).toBe(15)
    expect(loaded.state.completedIds).toEqual(['p01'])
    expect(loaded.state.startedAt).toBe(5_000)
    expect(loaded.state.opened).toBe(false)
    expect(formatElapsed(9_000 - loaded.state.startedAt)).toBe('00:04')
  })

  it('keeps playing in memory when storage cannot be written', () => {
    const blocked: PauseStore = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const loaded = loadGame(blocked, ['p01'], 1_000)
    expect(loaded.warning).toBe(true)
    expect(loaded.state.pointId).toBe('p01')
    expect(saveGame(blocked, loaded.state)).toBe(false)
  })

  it('advances in order and finishes on the last point', () => {
    let state = solve(freshGame('p01', 1))
    state = advance(state, 'p02')
    expect(state.pointId).toBe('p02')
    expect(state.opened).toBe(false)
    state = solve(state)
    state = advance(state, null, 90)
    expect(state.finished).toBe(true)
    expect(state.finishedElapsedSec).toBe(90)
    expect(state.completedIds).toEqual(['p01', 'p02'])
  })

  it('starts again with the same team and a higher attempt number', () => {
    const memory = memoryStore()
    let state = assignTeam(solve(freshGame('p01', 1)), { code: 'ROSE', name: 'ვარდისფერი' })
    state = advance(state, null, 90)
    expect(state.attempt).toBe(1)
    const again = retry(state, 'p01', 5_000)
    expect(again.attempt).toBe(2)
    expect(again.team).toEqual({ code: 'ROSE', name: 'ვარდისფერი' })
    expect(again.finished).toBe(false)
    expect(again.score).toBe(0)
    expect(again.pointId).toBe('p01')
    expect(again.completedIds).toEqual([])
    expect(again.startedAt).toBe(5_000)
    expect(retry(again, 'p01', 6_000)).toBe(again)

    const saved = { ...state }
    delete (saved as { attempt?: number }).attempt
    memory.setItem(GAME_KEY, JSON.stringify(saved))
    expect(loadGame(memory, ['p01', 'p02'], 7_000).state.attempt).toBe(1)
  })
})

function solve(state: GameState): GameState {
  return awardTask(awardLocation(state, location, minScore, 0), task, minScore)
}

function memoryStore(): PauseStore {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}
