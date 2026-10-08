import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { contentIssues, overlapIssues, structureIssues, type ConfigRecord, type Issue, type PointRecord, type TaskRecord } from '../src/content/rules.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const prod = process.argv.includes('--prod')

const points = readJson<PointRecord[]>('content/points.json')
const tasks = readJson<Record<string, TaskRecord>>('content/tasks.json')
const config = readJson<ConfigRecord>('content/config.json')
const questions = readJson<unknown>('content/questions.json')

const schemaIssues = [
  ...validate('content/schema/points.schema.json', points, 'points.json'),
  ...validate('content/schema/tasks.schema.json', tasks, 'tasks.json'),
  ...validate('content/schema/config.schema.json', config, 'config.json'),
  ...validate('content/schema/questions.schema.json', questions, 'questions.json'),
]
const issues = [
  ...schemaIssues,
  ...(schemaIssues.length === 0 ? structureIssues(points, tasks, config) : []),
  ...(schemaIssues.length === 0 ? overlapIssues(points) : []),
]
const blockers = contentIssues({ points, tasks, questions })
const blocking = [...issues, ...(prod ? blockers : [])]

if (!prod && blockers.length > 0) {
  console.log('დაუდასტურებელი კონტენტი (სატესტო ბილდს არ აჩერებს):')
  for (const issue of blockers) console.log(`- ${issue.message}`)
  console.log('')
}

if (blocking.length > 0) {
  console.error(prod ? 'პროდაქშენ-ბილდი ვერ გრძელდება.' : 'კონტენტის შემოწმება ვერ გაიარა.')
  for (const issue of blocking) console.error(`- ${issue.message}`)
  process.exit(1)
}

console.log(prod ? 'კონტენტი პროდაქშენისთვის მზადაა.' : 'კონტენტის სტრუქტურა სწორია.')

function validate(schemaFile: string, data: unknown, label: string): Issue[] {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const schema = readJson<object>(schemaFile)
  const valid = ajv.validate(schema, data)
  if (valid) return []
  return (ajv.errors ?? []).map((error) => ({
    code: 'schema',
    message: `${label}${error.instancePath || ''} ${error.message ?? 'არასწორია'}`,
  }))
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8')) as T
}
