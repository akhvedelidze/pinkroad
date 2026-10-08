import { readFileSync } from 'node:fs'
import { checkFinishCode } from '../src/game/finish.ts'

const config = JSON.parse(readFileSync(new URL('../content/config.json', import.meta.url), 'utf8')) as {
  minPlausibleDurationMin: number
}

const code = flag('--code')
const name = flag('--name')

if (!code || !name) {
  console.error('გამოყენება: npm run verify -- --code კოდი --name "გუნდის სახელი"')
  process.exit(1)
}

const result = await checkFinishCode(code, name, config.minPlausibleDurationMin)
if (!result.ok) {
  console.error('კოდი არ დადასტურდა.')
  process.exit(1)
}

console.log(`გუნდი: ${result.name} (${result.teamCode})`)
console.log(`ცდა: ${result.attempt}`)
console.log(`დრო: ${result.elapsedSec} წმ`)
console.log(`ქულა: ${result.score}`)
console.log('კოდი სწორია.')
if (result.shortTime) {
  console.log(
    `გაფრთხილება: დრო ${config.minPlausibleDurationMin} წუთზე ნაკლებია. ორგანიზატორმა ადგილზე გადაამოწმოს.`,
  )
}

function flag(name: string): string {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? '' : ''
}
