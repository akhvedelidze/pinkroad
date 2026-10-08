import { describe, expect, it } from 'vitest'
import { checkFinishCode, finishCode } from '../src/game/finish.ts'
import { assignTeam, freshGame, loadGame, saveGame } from '../src/game/progress.ts'
import type { PauseStore } from '../src/game/confirm.ts'

describe('finish code', () => {
  it('accepts the original code and rejects a changed score or check mark', async () => {
    const team = { code: 'ROSE', name: 'ვარდისფერი' }
    const code = await finishCode(team, 20 * 60, 86)
    const valid = await checkFinishCode(code, team.name, 15)
    expect(code.startsWith('ROSE.1.1200.86.')).toBe(true)
    expect(valid.ok).toBe(true)
    expect(valid.attempt).toBe(1)
    expect(valid.shortTime).toBe(false)
    expect(valid.score).toBe(86)

    const changedScore = code.replace('.86.', '.87.')
    expect((await checkFinishCode(changedScore, team.name, 15)).ok).toBe(false)

    const changedMark = `${code.slice(0, -1)}${code.endsWith('0') ? '1' : '0'}`
    expect((await checkFinishCode(changedMark, team.name, 15)).ok).toBe(false)
    expect((await checkFinishCode(code, 'სხვა სახელი', 15)).ok).toBe(false)

    const second = await finishCode(team, 20 * 60, 86, 2)
    expect(second.startsWith('ROSE.2.1200.86.')).toBe(true)
    expect((await checkFinishCode(second, team.name, 15)).attempt).toBe(2)
    expect((await checkFinishCode(second.replace('.2.', '.1.'), team.name, 15)).ok).toBe(false)
  })

  it('warns the organizer when the recorded time is below the minimum', async () => {
    const team = { code: 'ROSE', name: 'ვარდისფერი' }
    const code = await finishCode(team, 30, 12)
    const result = await checkFinishCode(code, team.name, 15)
    expect(result.ok).toBe(true)
    expect(result.shortTime).toBe(true)
  })

  it('keeps the team when the saved game is reopened', () => {
    const memory = memoryStore()
    const state = assignTeam(freshGame('p01', 1), { code: 'rose', name: '  ვარდისფერი  ' })
    expect(state.team).toEqual({ code: 'ROSE', name: 'ვარდისფერი' })
    saveGame(memory, state)
    expect(loadGame(memory, ['p01'], 2).state.team).toEqual({ code: 'ROSE', name: 'ვარდისფერი' })
  })
})

function memoryStore(): PauseStore {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}
