import { describe, expect, it } from 'vitest'
import { distanceMeters } from '../src/content/bearing.ts'
import {
  emptyPause,
  judgeTap,
  pauseDurationSec,
  readPause,
  remainingPauseMs,
  writePause,
  wrongConfirm,
  type PauseStore,
} from '../src/game/confirm.ts'

const lighthouse = { lat: 41.6558989, lng: 41.6410718 }
const schedule = [10, 20, 40, 40]

describe('tap check', () => {
  it('accepts a tap on the point and inside the radius', () => {
    expect(judgeTap(0, 150)).toBe('correct')
    expect(judgeTap(distanceMeters(lighthouse, { lat: 41.6564, lng: 41.6410718 }), 150)).toBe('correct')
  })

  it('accepts a tap exactly on the radius and rejects one just outside', () => {
    const away = { lat: 41.66, lng: 41.6410718 }
    const meters = distanceMeters(lighthouse, away)
    expect(judgeTap(meters, meters)).toBe('correct')
    expect(judgeTap(meters + 0.01, meters)).toBe('outside')
  })

  it('rejects a tap beyond the radius', () => {
    const far = distanceMeters(lighthouse, { lat: 41.61, lng: 41.6 })
    expect(far).toBeGreaterThan(150)
    expect(judgeTap(far, 150)).toBe('outside')
  })
})

describe('confirm pause', () => {
  it('uses 10, 20, then 40 seconds', () => {
    expect(pauseDurationSec(1, schedule)).toBe(10)
    expect(pauseDurationSec(2, schedule)).toBe(20)
    expect(pauseDurationSec(3, schedule)).toBe(40)
    expect(pauseDurationSec(4, schedule)).toBe(40)
  })

  it('keeps the remaining pause after a reload', () => {
    const store = memoryStore()
    const started = wrongConfirm(emptyPause('p01'), schedule, 1_000_000)
    writePause(store, started)
    const loaded = readPause(store, 'p01')
    expect(remainingPauseMs(loaded, 1_003_000)).toBe(7_000)
    expect(remainingPauseMs(loaded, 1_003_000)).toBeLessThan(10_000)
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
