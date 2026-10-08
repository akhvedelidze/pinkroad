import { createSalt, hashAnswer } from '../src/content/hash.ts'

const answer = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
if (!answer) {
  console.error('Usage: npm run hash:answer -- "პასუხი"')
  process.exit(1)
}

const salt = createSalt()
const answerHash = await hashAnswer(answer, salt)
console.log(JSON.stringify({ salt, answerHash }, null, 2))
