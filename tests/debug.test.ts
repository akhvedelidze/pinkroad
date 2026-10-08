import { describe, expect, it } from 'vitest'
import config from '../content/config.json'
import { adjustScore, freshGame, skipPoint } from '../src/game/progress.ts'

describe('debug controls', () => {
  it('skips the current point without changing the score', () => {
    const start = { ...freshGame('p01', 1_000), score: 12, opened: true, locationWrong: 2 }
    const next = skipPoint(start, 'p02', 40)
    expect(next.pointId).toBe('p02')
    expect(next.completedIds).toEqual(['p01'])
    expect(next.score).toBe(12)
    expect(next.opened).toBe(false)
    expect(next.locationWrong).toBe(0)
    expect(next.pause.pointId).toBe('p02')
    expect(skipPoint(next, 'p03', 40).completedIds).toEqual(['p01', 'p02'])
  })

  it('finishes when the last point is skipped', () => {
    const done = skipPoint(freshGame('p16', 1_000), null, 90)
    expect(done.finished).toBe(true)
    expect(done.finishedElapsedSec).toBe(90)
    expect(done.completedIds).toEqual(['p16'])
    expect(skipPoint(done, null, 10)).toBe(done)
  })

  it('changes the score and keeps it at the minimum', () => {
    const start = freshGame('p01', 1_000)
    const raised = adjustScore(start, 5, config.scoring.minPointScore)
    expect(raised.score).toBe(5)
    expect(adjustScore(raised, -5, config.scoring.minPointScore).score).toBe(0)
    expect(adjustScore(start, -5, config.scoring.minPointScore).score).toBe(0)
  })
})
