import { distanceMeters, fromPrevious } from './bearing.ts'

export type Issue = { code: string; message: string }

export type PointRecord = {
  id?: string
  order?: number
  stage?: string
  toleranceM?: number
  location?: { lat?: number | null; lng?: number | null; verified?: boolean }
  clue?: { fromPrevious?: { bearingText?: string; distanceM?: number } | null }
  taskId?: string
}

export type TaskRecord = {
  type?: string
  reviewed?: boolean
  variants?: Array<{ q?: string; options?: string[]; letters?: string; answerHash?: string; salt?: string }>
}

export type ConfigRecord = {
  tolerances?: Record<string, number>
  mapBounds?: { south: number; west: number; north: number; east: number }
}

const PLACEHOLDERS = ['[[DOCTOR_FILL]]', 'TODO_DOCTOR_REVIEW']

export function contentIssues(value: unknown): Issue[] {
  const issues: Issue[] = []
  walk(value, '$', (path, key, item) => {
    if (key === 'verified' && item === false) {
      issues.push({ code: 'unverified', message: `${path}: location.verified არის false` })
    }
    if (key === 'reviewed' && item === false) {
      issues.push({ code: 'unreviewed', message: `${path}: reviewed არის false` })
    }
    if (typeof item === 'string' && PLACEHOLDERS.some((token) => item.includes(token))) {
      issues.push({ code: 'placeholder', message: `${path}: ტექსტშია დაუდასტურებელი ადგილი` })
    }
  })
  return issues
}

export function overlapIssues(points: PointRecord[]): Issue[] {
  const issues: Issue[] = []
  const located = points.filter(hasLocation)
  for (let left = 0; left < located.length; left += 1) {
    for (let right = left + 1; right < located.length; right += 1) {
      const a = located[left]
      const b = located[right]
      const meters = distanceMeters(
        { lat: a.location.lat, lng: a.location.lng },
        { lat: b.location.lat, lng: b.location.lng },
      )
      const limit = (a.toleranceM ?? 0) + (b.toleranceM ?? 0)
      if (meters < limit) {
        issues.push({
          code: 'overlap',
          message: `${a.id} და ${b.id}: მიღების რადიუსები ერთმანეთს ფარავს (${Math.round(meters)} მ, რადიუსები ${a.toleranceM}+${b.toleranceM} მ).`,
        })
      }
    }
  }
  return issues
}

export function structureIssues(
  points: PointRecord[],
  tasks: Record<string, TaskRecord>,
  config: ConfigRecord,
): Issue[] {
  const issues: Issue[] = []
  const ordered = [...points].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  ordered.forEach((point, index) => {
    if (point.order !== index + 1) {
      issues.push({ code: 'order', message: `${point.id ?? index}: order უნდა იყოს ${index + 1}` })
    }
    const expectedTolerance = point.stage ? config.tolerances?.[point.stage] : undefined
    if (expectedTolerance != null && point.toleranceM !== expectedTolerance) {
      issues.push({
        code: 'tolerance',
        message: `${point.id}: toleranceM უნდა იყოს ${expectedTolerance} (${point.stage})`,
      })
    }
    if (point.taskId && !tasks[point.taskId]) {
      issues.push({ code: 'missing-task', message: `${point.id}: დავალება ${point.taskId} ვერ მოიძებნა` })
    }
    if (point.taskId && tasks[point.taskId]) issues.push(...taskShapeIssues(point.id ?? point.taskId, tasks[point.taskId]))
    if (point.location?.lat == null || point.location.lng == null) {
      issues.push({ code: 'missing-coordinates', message: `${point.id}: კოორდინატი არ არის` })
      return
    }
    const bounds = config.mapBounds
    if (
      bounds &&
      (point.location.lat < bounds.south ||
        point.location.lat > bounds.north ||
        point.location.lng < bounds.west ||
        point.location.lng > bounds.east)
    ) {
      issues.push({ code: 'off-map', message: `${point.id}: კოორდინატი რუკის საზღვრებს გარეთაა` })
    }
  })

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    const current = ordered[index]
    if (!hasLocation(previous) || !hasLocation(current)) continue
    const expected = fromPrevious(
      { lat: previous.location.lat, lng: previous.location.lng },
      { lat: current.location.lat, lng: current.location.lng },
    )
    const stored = current.clue?.fromPrevious
    if (!stored || stored.bearingText !== expected.bearingText || stored.distanceM !== expected.distanceM) {
      issues.push({
        code: 'bearing',
        message: `${current.id}: მიმართულება უნდა იყოს „${expected.bearingText}, ${expected.distanceM} მ“`,
      })
    }
  }
  if (ordered[0]?.clue?.fromPrevious) {
    issues.push({ code: 'bearing', message: `${ordered[0].id}: პირველ პუნქტს წინა მიმართულება არ აქვს` })
  }
  return issues
}

function taskShapeIssues(id: string, task: TaskRecord): Issue[] {
  const issues: Issue[] = []
  const variants = task.variants ?? []
  if (variants.length < 2 || variants.length > 3) {
    issues.push({ code: 'task-shape', message: `${id}: დავალებას 2 ან 3 ვარიანტი უნდა ჰქონდეს` })
  }
  for (const variant of variants) {
    if (task.type === 'mythfact' && variant.options?.length !== 2) {
      issues.push({ code: 'task-shape', message: `${id}: მითი/ფაქტი ორ პასუხს ითხოვს` })
    }
    if (task.type === 'mcq' && variant.options?.length !== 4) {
      issues.push({ code: 'task-shape', message: `${id}: ტესტს ოთხი პასუხი უნდა ჰქონდეს` })
    }
    if (task.type === 'anagram' && !variant.letters) {
      issues.push({ code: 'task-shape', message: `${id}: ანაგრამას ასოები აკლია` })
    }
    if (!variant.answerHash || !variant.salt) {
      issues.push({ code: 'task-shape', message: `${id}: პასუხის ჰეში ან salt აკლია` })
    }
  }
  return issues
}

function hasLocation(point: PointRecord): point is PointRecord & {
  id: string
  toleranceM: number
  location: { lat: number; lng: number }
} {
  return Boolean(
    point.id &&
      typeof point.toleranceM === 'number' &&
      point.location &&
      typeof point.location.lat === 'number' &&
      typeof point.location.lng === 'number',
  )
}

function walk(value: unknown, path: string, visit: (path: string, key: string, value: unknown) => void) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`
    visit(childPath, key, child)
    if (child && typeof child === 'object') walk(child, childPath, visit)
  }
}
