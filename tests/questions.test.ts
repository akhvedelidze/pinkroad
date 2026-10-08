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

  it('keeps each anagram solution out of that puzzle and checks it by hash', async () => {
    expect(questions.anagram.every((item) => item.q === 'დაალაგე ასოები და გამოიცანი სიტყვა.')).toBe(true)
    expect(questions.mythfact[0]?.q.startsWith('ჩივილების არქონის')).toBe(true)

    for (const item of questions.anagram) {
      expect(item.hint.length).toBeGreaterThan(0)
      const word = solutionWords.find((candidate) => sameLetters(candidate, item.letters))
      expect(word).toBeTruthy()
      const shown = `${item.q}\n${item.hint}\n${item.letters}`
      expect(shown.includes(word ?? '')).toBe(false)
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
