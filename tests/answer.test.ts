import { describe, expect, it } from 'vitest'
import tasks from '../content/tasks.json'
import { answerMatches, lettersOf } from '../src/game/answer.ts'

describe('task answers', () => {
  it('accepts the hashed myth or fact choice and rejects the other', async () => {
    const variant = tasks.p01.variants[0]
    expect(await answerMatches('მითი', variant.salt, variant.answerHash)).toBe(true)
    expect(await answerMatches('ფაქტი', variant.salt, variant.answerHash)).toBe(false)
  })

  it('accepts one of the four test choices by hash', async () => {
    const variant = tasks.p04.variants[0]
    const options = variant.options ?? []
    const results = await Promise.all(options.map((option) => answerMatches(option, variant.salt, variant.answerHash)))
    expect(results.filter(Boolean)).toEqual([true])
    expect(options.join('')).not.toContain(variant.answerHash)
  })

  it('checks a Georgian anagram by its letters, not by the scrambled text', async () => {
    const variant = tasks.p03.variants[0]
    const letters = lettersOf(variant.letters ?? '')
    expect(letters).toEqual(['ი', 'გ', 'კ', 'ი', 'ნ', 'ი', 'ნ', 'ს', 'რ'])
    const word = ['ს', 'კ', 'რ', 'ი', 'ნ', 'ი', 'ნ', 'გ', 'ი'].join('')
    expect(letters.slice().sort().join('')).toBe(lettersOf(word).slice().sort().join(''))
    expect(await answerMatches(word, variant.salt, variant.answerHash)).toBe(true)
    expect(await answerMatches(variant.letters ?? '', variant.salt, variant.answerHash)).toBe(false)
  })
})
