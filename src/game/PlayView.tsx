import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import config from '../../content/config.json'
import points from '../../content/points.json'
import tasks from '../../content/tasks.json'
import { distanceMeters } from '../content/bearing.ts'
import { MapView } from '../map/MapView.tsx'
import { pickIndex } from './answer.ts'
import { judgeTap, remainingPauseMs } from './confirm.ts'
import { finishCode } from './finish.ts'
import {
  adjustScore,
  advance,
  assignTeam,
  awardLocation,
  awardTask,
  formatElapsed,
  loadGame,
  noteWrongLocation,
  noteWrongTask,
  progressLabel,
  retry,
  saveGame,
  skipPoint,
  type GameState,
} from './progress.ts'
import { questionCount, TaskCard } from './TaskCard.tsx'
import { TeamGate } from './TeamGate.tsx'
import { DebugBar } from './DebugBar.tsx'

const route = [...points].sort((left, right) => left.order - right.order)
const routeIds = route.map((point) => point.id)
const schedule = config.penalties.wrongConfirmPauseSec

export function PlayView({ onBack }: { onBack: () => void }) {
  const [loaded] = useState(() => loadGame(localStorage, routeIds, Date.now()))
  const [game, setGame] = useState<GameState>(loaded.state)
  const [storageWarning, setStorageWarning] = useState(loaded.warning)
  const [guess, setGuess] = useState<{ lat: number; lng: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [routeDraw, setRouteDraw] = useState(1)
  const [finishText, setFinishText] = useState('')
  const seenRoute = useRef(game.completedIds.length)
  const point = route.find((item) => item.id === game.pointId) ?? route[0]
  const task = tasks[point.taskId as keyof typeof tasks]
  const next = route.find((item) => item.order === point.order + 1) ?? null
  const solved = game.solvedPointId === point.id
  const remaining = remainingPauseMs(game.pause, now)
  const waiting = remaining > 0 && !game.opened
  const routeLine = useMemo(
    () =>
      game.completedIds
        .map((id) => route.find((item) => item.id === id))
        .filter((item): item is (typeof route)[number] => item != null && item.location.lat != null && item.location.lng != null)
        .map((item) => ({ lat: item.location.lat as number, lng: item.location.lng as number })),
    [game.completedIds],
  )

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), waiting ? 250 : 1000)
    return () => clearInterval(timer)
  }, [waiting])

  useEffect(() => {
    setGuess(null)
  }, [game.pointId])

  useEffect(() => {
    const completed = game.completedIds.length
    if (completed < 2 || completed === seenRoute.current) {
      seenRoute.current = completed
      return
    }
    seenRoute.current = completed
    let start = 0
    let frame = 0
    const step = (time: number) => {
      if (start === 0) start = time
      const draw = Math.min(1, (time - start) / 700)
      setRouteDraw(draw)
      if (draw < 1) frame = requestAnimationFrame(step)
    }
    setRouteDraw(0)
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [game.completedIds.length])

  useEffect(() => {
    if (!game.finished || !game.team || game.finishedElapsedSec == null) {
      setFinishText('')
      return
    }
    let cancelled = false
    finishCode(game.team, game.finishedElapsedSec, game.score, game.attempt).then((code) => {
      if (!cancelled) setFinishText(code)
    })
    return () => {
      cancelled = true
    }
  }, [game.finished, game.team, game.finishedElapsedSec, game.score, game.attempt])

  function update(recipe: (current: GameState) => GameState) {
    setGame((current) => {
      const nextState = recipe(current)
      if (!saveGame(localStorage, nextState)) setStorageWarning(true)
      return nextState
    })
  }

  function confirm() {
    if (!guess || waiting || game.opened || game.finished || point.location.lat == null || point.location.lng == null) return
    const meters = distanceMeters(guess, { lat: point.location.lat, lng: point.location.lng })
    if (judgeTap(meters, point.toleranceM) === 'correct') {
      const count = questionCount(task.type)
      const questionIndex = pickIndex(Math.max(1, count))
      update((current) => awardLocation(current, config.scoring.locationByAttempt, config.scoring.minPointScore, questionIndex))
      return
    }
    const at = Date.now()
    update((current) => noteWrongLocation(current, schedule, at))
  }

  const seconds = Math.ceil(remaining / 1000)
  const shownElapsed =
    game.finished && game.finishedElapsedSec != null ? game.finishedElapsedSec * 1000 : now - game.startedAt
  const debugOn =
    import.meta.env.MODE !== 'production' && new URLSearchParams(location.search).get('debug') === '1'

  if (!game.team) {
    return <TeamGate onBack={onBack} onJoin={(team) => update((current) => assignTeam(current, team))} />
  }

  return (
    <MapView
      onBack={onBack}
      title="თამაში"
      showCheck={false}
      guess={game.opened || game.finished ? null : guess}
      onTap={game.opened || game.finished ? undefined : setGuess}
      route={routeLine}
      routeDraw={routeDraw}
      radius={
        debugOn && point.location.lat != null && point.location.lng != null
          ? { lat: point.location.lat, lng: point.location.lng, meters: point.toleranceM }
          : null
      }
      banner={
        <div class="play-banner">
          <p class="play-status" role="status">
            <span>{progressLabel(point.order, route.length, game.finished)}</span>
            <span>{game.score} ქულა</span>
            <span>{formatElapsed(shownElapsed)}</span>
            <span>ცდა {game.attempt}</span>
          </p>
          {storageWarning && <p class="play-warning">პროგრესი ამ მოწყობილობაზე ვერ ინახება. თამაში მაინც გრძელდება.</p>}
          {debugOn && (
            <DebugBar
              radiusM={point.toleranceM}
              canSkip={!game.finished}
              onSkip={() =>
                update((current) =>
                  skipPoint(current, next?.id ?? null, Math.floor((Date.now() - current.startedAt) / 1000)),
                )
              }
              onAdjust={(delta) => update((current) => adjustScore(current, delta, config.scoring.minPointScore))}
            />
          )}
          <p class="clue-label">მინიშნება</p>
          <p class="clue-text">{game.finished ? 'მარშრუტი დასრულდა.' : point.clue.riddle}</p>
        </div>
      }
      footer={
        <div class="play-footer">
          {game.finished ? (
            <div class="finish-card" role="status">
              <p class="pin-note">ყველა პუნქტი გავლილია.</p>
              <p class="clue-text">
                {game.team.name} ({game.team.code})
              </p>
              <p class="pin-note">ცდა {game.attempt}</p>
              <p class="finish-code">{finishText || 'კოდი იწერება…'}</p>
              <button
                type="button"
                class="confirm-btn next-btn"
                onClick={() => update((current) => retry(current, route[0]?.id ?? 'p01', Date.now()))}
              >
                სცადე ხელახლა
              </button>
            </div>
          ) : game.opened ? (
            <>
              <TaskCard
                key={`${point.id}:${game.questionIndex}`}
                task={task}
                questionIndex={game.questionIndex}
                solved={solved}
                onCorrect={() => update((current) => awardTask(current, config.scoring.taskByAttempt, config.scoring.minPointScore))}
                onWrong={() => update((current) => noteWrongTask(current))}
              />
              {solved && (
                <button
                  type="button"
                  class="confirm-btn next-btn"
                  onClick={() =>
                    update((current) =>
                      advance(current, next?.id ?? null, Math.floor((Date.now() - current.startedAt) / 1000)),
                    )
                  }
                >
                  {next ? 'შემდეგი პუნქტი' : 'დასრულება'}
                </button>
              )}
            </>
          ) : (
            <>
              <p class="pin-note" role="status">
                {waiting
                  ? `დადასტურება ${seconds} წამით იკეტება. რუკის ყურება შეიძლება.`
                  : guess
                    ? 'ვარდისფერი ნიშანი დასმულია.'
                    : 'შეეხე რუკას და დაადე ნიშანი.'}
              </p>
              <button type="button" class="confirm-btn" disabled={!guess || waiting} onClick={confirm}>
                {waiting ? `დაელოდე ${seconds} წამს` : 'აქ არის ჩემი პუნქტი'}
              </button>
            </>
          )}
        </div>
      }
    />
  )
}
