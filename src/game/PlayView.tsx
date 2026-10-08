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

  if (game.finished) {
    return (
      <main class="result-board">
        <button type="button" class="map-back result-back" onClick={onBack}>
          უკან
        </button>
        <p class="result-kicker">ფინიში</p>
        <h1 class="result-title">მარშრუტი დასრულდა.</h1>
        <p class="result-team-label">გუნდი</p>
        <p class="result-team">{game.team.name}</p>
        <p class="result-code-name">{game.team.code}</p>
        <div class="result-grid">
          <p class="result-cell">
            <span>დრო</span>
            <strong class="result-time">{formatElapsed(shownElapsed)}</strong>
          </p>
          <p class="result-cell">
            <span>ქულა</span>
            <strong class="result-score">{game.score}</strong>
          </p>
          <p class="result-cell">
            <span>ცდა</span>
            <strong class="result-attempt">{game.attempt}</strong>
          </p>
        </div>
        <p class="result-judge">მსაჯის კოდი</p>
        <p class="finish-code">{finishText || 'კოდი იწერება…'}</p>
        <button
          type="button"
          class="confirm-btn result-retry"
          onClick={() => update((current) => retry(current, route[0]?.id ?? 'p01', Date.now()))}
        >
          სცადე ხელახლა
        </button>
      </main>
    )
  }

  const skipButton = !solved && (
    <button
      type="button"
      class="skip-point-btn"
      onClick={() =>
        update((current) => skipPoint(current, next?.id ?? null, Math.floor((Date.now() - current.startedAt) / 1000)))
      }
    >
      გამოტოვე პუნქტი
    </button>
  )

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
              onAdjust={(delta) => update((current) => adjustScore(current, delta, config.scoring.minPointScore))}
            />
          )}
          {game.opened ? (
            <p class="found-note">ადგილი ნაპოვნია</p>
          ) : (
            <>
              <p class="clue-label">ნაბიჯი 1 · იპოვე ადგილი</p>
              <p class="clue-text">{point.clue.riddle}</p>
            </>
          )}
        </div>
      }
      footer={
        <div class="play-footer">
          {game.opened ? (
            <>
              <TaskCard
                key={`${point.id}:${game.questionIndex}`}
                task={task}
                questionIndex={game.questionIndex}
                solved={solved}
                onCorrect={() => update((current) => awardTask(current, config.scoring.taskByAttempt, config.scoring.minPointScore))}
                onWrong={() => update((current) => noteWrongTask(current))}
              />
              {solved ? (
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
              ) : (
                skipButton
              )}
            </>
          ) : (
            <>
              <p class="pin-note" role="status">
                {waiting
                  ? `დადასტურება ${seconds} წამით იკეტება. რუკის ყურება შეიძლება.`
                  : guess
                    ? 'ნიშანი დასმულია. ახლა დააჭირე ღილაკს.'
                    : 'მონიშნეთ სავარაუდო ადგილი რუკაზე'}
              </p>
              <button type="button" class="confirm-btn" disabled={!guess || waiting} onClick={confirm}>
                {waiting ? `დაელოდე ${seconds} წამს` : 'აქ არის ჩემი პუნქტი'}
              </button>
              {skipButton}
            </>
          )}
        </div>
      }
    />
  )
}
