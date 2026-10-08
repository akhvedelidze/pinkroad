import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import questions from '../content/questions.json'
import { answerMatches, lettersOf, pickIndex } from '../src/game/answer.ts'

const solutionWords = [
  'სკრინინგი',
  'ჯანმრთელობა',
  'მხარდაჭერა',
  'გამოკვლევა',
  'პრევენცია',
  'კონსულტაცია',
  'ინფორმაცია',
  'ყურადღება',
  'მზრუნველობა',
  'გამბედაობა',
  'თანაგრძნობა',
  'შფოთვა',
]

describe('question bank', () => {
  it('holds about fifty questions across several categories', () => {
    const all = [...questions.mythfact, ...questions.mcq, ...questions.anagram]
    expect(questions.mythfact).toHaveLength(20)
    expect(questions.mcq).toHaveLength(18)
    expect(questions.anagram).toHaveLength(12)
    expect(new Set(all.map((item) => item.category)).size).toBeGreaterThanOrEqual(6)
    expect(all.every((item) => item.reviewed === false)).toBe(true)
  })

  it('keeps anagram solutions out of the question file and checks them by hash', async () => {
    const text = readFileSync(new URL('../content/questions.json', import.meta.url), 'utf8')
    for (const word of solutionWords) expect(text.includes(word)).toBe(false)

    for (const item of questions.anagram) {
      expect(item.hint.length).toBeGreaterThan(0)
      const word = solutionWords.find((candidate) => sameLetters(candidate, item.letters))
      expect(word).toBeTruthy()
      expect(item.hint.includes(word ?? '')).toBe(false)
      expect(await answerMatches(word ?? '', item.salt, item.answerHash)).toBe(true)
      expect(await answerMatches(item.letters, item.salt, item.answerHash)).toBe(false)
    }
  })

  it('accepts exactly one choice for each myth, fact, and multiple-choice item', async () => {
    for (const item of [...questions.mythfact, ...questions.mcq]) {
      const results = await Promise.all(item.options.map((option) => answerMatches(option, item.salt, item.answerHash)))
      expect(results.filter(Boolean)).toHaveLength(1)
    }
  })

  it('picks a stable index from the supplied random value', () => {
    expect(pickIndex(20, () => 0)).toBe(0)
    expect(pickIndex(20, () => 0.999)).toBe(19)
    expect(pickIndex(1, () => 0.4)).toBe(0)
  })
})

function sameLetters(word: string, letters: string): boolean {
  return lettersOf(word).slice().sort().join('') === lettersOf(letters).slice().sort().join('')
}
