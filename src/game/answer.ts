import { hashAnswer } from '../content/hash.ts'

export function lettersOf(letters: string): string[] {
  return [...letters.normalize('NFC')]
}

export function pickIndex(length: number, random: () => number = Math.random): number {
  if (length <= 1) return 0
  const index = Math.floor(random() * length)
  return Math.min(length - 1, Math.max(0, index))
}

export async function answerMatches(answer: string, salt: string, answerHash: string): Promise<boolean> {
  return (await hashAnswer(answer, salt)) === answerHash
}
