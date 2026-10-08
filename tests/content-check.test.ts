import { readFileSync } from 'node:fs'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { bearingText, fromPrevious } from '../src/content/bearing.ts'
import { hashAnswer } from '../src/content/hash.ts'
import { contentIssues, overlapIssues, structureIssues, type PointRecord, type TaskRecord } from '../src/content/rules.ts'
import pointsSchema from '../content/schema/points.schema.json'

const points = JSON.parse(readFileSync(new URL('../content/points.json', import.meta.url), 'utf8')) as PointRecord[]
const tasks = JSON.parse(readFileSync(new URL('../content/tasks.json', import.meta.url), 'utf8')) as Record<string, TaskRecord>

describe('answer hashing', () => {
  it('hides the answer text inside the hash', async () => {
    const salt = 'abc123abc123abcd'
    const hashed = await hashAnswer('სკრინინგი', salt)
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
    expect(hashed.includes('სკრინინგი')).toBe(false)
    expect(await hashAnswer('სკრინინგი', salt)).toBe(hashed)
    expect(await hashAnswer('სხვა', salt)).not.toBe(hashed)
  })
})

describe('bearing', () => {
  it('names the eight compass directions in Georgian', () => {
    expect(bearingText(0)).toBe('ჩრდილოეთით')
    expect(bearingText(45)).toBe('ჩრდილო-აღმოსავლეთით')
    expect(bearingText(90)).toBe('აღმოსავლეთით')
    expect(bearingText(180)).toBe('სამხრეთით')
    expect(bearingText(270)).toBe('დასავლეთით')
    expect(bearingText(-45)).toBe('ჩრდილო-დასავლეთით')
  })
})

describe('content rules', () => {
  it('flags overlapping acceptance circles and ignores distant ones', () => {
    const overlapping = overlapIssues([
      point('a', 41.65, 41.64, 80),
      point('b', 41.65, 41.64, 80),
    ])
    const separate = overlapIssues([
      point('a', 41.65, 41.64, 60),
      point('b', 41.53, 41.56, 60),
    ])
    expect(overlapping.map((issue) => issue.code)).toEqual(['overlap'])
    expect(separate).toEqual([])
  })

  it('blocks production when content is still unreviewed', () => {
    const issues = contentIssues({
      location: { verified: false },
      doctorNote: { text: 'ასაკი [[DOCTOR_FILL]]', reviewed: false },
      note: 'TODO_DOCTOR_REVIEW',
    })
    expect(issues.map((issue) => issue.code)).toEqual(['unverified', 'placeholder', 'unreviewed', 'placeholder'])
  })

  it('checks the real route bearings and finds the current overlaps', () => {
    const config = {
      tolerances: { practice: 300, navigator: 160, expert: 120, bonus: 200 },
      mapBounds: { south: 41.5312428, west: 41.5594872, north: 41.7170258, east: 41.7456988 },
    }
    expect(structureIssues(points, tasks, config).filter((issue) => issue.code === 'bearing')).toEqual([])
    expect(overlapIssues(points).length).toBeGreaterThan(0)
    const second = points[1]
    const link = fromPrevious(
      { lat: points[0].location!.lat as number, lng: points[0].location!.lng as number },
      { lat: second.location!.lat as number, lng: second.location!.lng as number },
    )
    expect(second.clue?.fromPrevious).toEqual(link)
  })
})

describe('points schema', () => {
  it('rejects a point without a name', () => {
    const ajv = new Ajv({ allErrors: true, strict: false })
    const broken = [{ ...points[0], name: undefined }]
    expect(ajv.validate(pointsSchema, broken)).toBe(false)
  })
})

function point(id: string, lat: number, lng: number, toleranceM: number): PointRecord {
  return { id, toleranceM, location: { lat, lng } }
}
