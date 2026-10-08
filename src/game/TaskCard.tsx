import { useState } from 'preact/hooks'
import questions from '../../content/questions.json'
import { answerMatches, lettersOf } from './answer.ts'

type Prompt = {
  category?: string
  q: string
  hint?: string
  options?: string[]
  letters?: string
  answerHash: string
  salt: string
}

type Task = {
  type: string
  variants: Prompt[]
}

const pools: Record<string, readonly Prompt[]> = questions

export function questionCount(type: string): number {
  return pools[type]?.length ?? 0
}

export function TaskCard({
  task,
  questionIndex = 0,
  solved = false,
  onCorrect,
  onWrong,
}: {
  task: Task
  questionIndex?: number
  solved?: boolean
  onCorrect?: () => void
  onWrong?: () => void
}) {
  const pool = pools[task.type] ?? []
  const index = pool.length > 0 ? Math.min(pool.length - 1, Math.max(0, questionIndex)) : 0
  const variant = pool[index] ?? task.variants[0]
  const [verdict, setVerdict] = useState<'correct' | 'wrong' | null>(solved ? 'correct' : null)
  const [pending, setPending] = useState(false)
  const locked = pending || verdict === 'correct' || solved

  async function choose(answer: string) {
    if (locked) return
    setPending(true)
    const matches = await answerMatches(answer, variant.salt, variant.answerHash)
    setVerdict(matches ? 'correct' : 'wrong')
    setPending(false)
    if (matches) onCorrect?.()
    else onWrong?.()
  }

  return (
    <div class="task-card">
      <p class="clue-label">{variant.category ?? 'დავალება'}</p>
      <p class="clue-text">{variant.q}</p>
      {variant.hint && <p class="clue-text">{variant.hint}</p>}
      {task.type === 'anagram' ? (
        <Anagram letters={variant.letters ?? ''} locked={locked} onSubmit={choose} />
      ) : (
        <div class="choice-list">
          {(variant.options ?? []).map((option) => (
            <button key={option} type="button" class="choice-btn" disabled={locked} onClick={() => choose(option)}>
              {option}
            </button>
          ))}
        </div>
      )}
      {verdict && (
        <p class={verdict === 'correct' ? 'verdict verdict-ok' : 'verdict verdict-bad'} role="status">
          {verdict === 'correct' ? 'სწორია' : 'არასწორია'}
        </p>
      )}
    </div>
  )
}

function Anagram({
  letters,
  locked,
  onSubmit,
}: {
  letters: string
  locked: boolean
  onSubmit: (answer: string) => void
}) {
  const pieces = lettersOf(letters).map((letter, id) => ({ id, letter }))
  const [picked, setPicked] = useState<number[]>([])
  const used = new Set(picked)
  const word = picked.map((id) => pieces[id]?.letter ?? '').join('')

  function add(id: number) {
    if (locked || used.has(id)) return
    setPicked((current) => [...current, id])
  }

  function remove(id: number) {
    if (locked) return
    setPicked((current) => current.filter((item) => item !== id))
  }

  return (
    <div class="anagram">
      <div class="letter-row" aria-label="შედგენილი სიტყვა">
        {picked.length === 0 ? (
          <span class="letter-empty">ასოები აქ ჩაჯდება</span>
        ) : (
          picked.map((id) => (
            <button key={id} type="button" class="letter-btn" disabled={locked} onClick={() => remove(id)}>
              {pieces[id]?.letter}
            </button>
          ))
        )}
      </div>
      <div class="letter-pool">
        {pieces.map((piece) => (
          <button
            key={piece.id}
            type="button"
            class="letter-btn"
            disabled={locked || used.has(piece.id)}
            onClick={() => add(piece.id)}
          >
            {piece.letter}
          </button>
        ))}
      </div>
      <button
        type="button"
        class="confirm-btn"
        disabled={locked || word.length !== pieces.length}
        onClick={() => onSubmit(word)}
      >
        შემოწმება
      </button>
    </div>
  )
}
