import type { Team } from './progress.ts'

const FINISH_SALT = 'pink-route-finish-v1'

export type FinishCheck = {
  ok: boolean
  teamCode: string
  name: string
  attempt: number
  elapsedSec: number
  score: number
  shortTime: boolean
}

export async function finishCode(team: Team, elapsedSec: number, score: number, attempt = 1): Promise<string> {
  const seconds = whole(elapsedSec)
  const points = whole(score)
  const tryNumber = wholeAttempt(attempt)
  const digest = await boundHash(team, tryNumber, seconds, points)
  return `${team.code}.${tryNumber}.${seconds}.${points}.${digest.slice(0, 8)}`
}

export async function checkFinishCode(code: string, name: string, minMinutes = 15): Promise<FinishCheck> {
  const failed = emptyCheck(name)
  const parts = code.normalize('NFC').trim().toUpperCase().split('.')
  if (parts.length !== 5) return failed
  const [teamCode, attemptText, secondsText, scoreText, check] = parts
  if (!/^[A-Z0-9]{2,12}$/.test(teamCode)) return failed
  if (!/^[1-9]\d*$/.test(attemptText) || !/^\d+$/.test(secondsText) || !/^\d+$/.test(scoreText)) return failed
  if (!/^[0-9A-F]{8}$/.test(check)) return failed
  const attempt = Number(attemptText)
  const elapsedSec = Number(secondsText)
  const score = Number(scoreText)
  const team = { code: teamCode, name: name.normalize('NFC').trim().replace(/\s+/g, ' ') }
  if ([...team.name].length < 2) return failed
  const expected = await finishCode(team, elapsedSec, score, attempt)
  const ok = expected === `${teamCode}.${attempt}.${elapsedSec}.${score}.${check.toLowerCase()}`
  if (!ok) return { ...failed, teamCode, attempt, elapsedSec, score }
  return {
    ok: true,
    teamCode,
    name: team.name,
    attempt,
    elapsedSec,
    score,
    shortTime: elapsedSec < minMinutes * 60,
  }
}

function whole(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function wholeAttempt(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.floor(value)
}

async function boundHash(team: Team, attempt: number, seconds: number, points: number): Promise<string> {
  const payload = `${FINISH_SALT}\n${team.code}\n${team.name}\n${attempt}\n${seconds}\n${points}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function emptyCheck(name: string): FinishCheck {
  return { ok: false, teamCode: '', name, attempt: 0, elapsedSec: 0, score: 0, shortTime: false }
}
