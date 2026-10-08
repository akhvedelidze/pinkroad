import { useState } from 'preact/hooks'
import { parseTeam, type Team } from './progress.ts'

export function TeamGate({ onBack, onJoin }: { onBack: () => void; onJoin: (team: Team) => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [rejected, setRejected] = useState(false)
  const team = parseTeam(code, name)

  function submit(event: Event) {
    event.preventDefault()
    if (!team) {
      setRejected(true)
      return
    }
    onJoin(team)
  }

  return (
    <main class="welcome team-gate">
      <button type="button" class="map-back team-back" onClick={onBack}>
        უკან
      </button>
      <h1>გუნდის შესვლა</h1>
      <p class="lead">შეიყვანეთ გუნდის კოდი და სახელწოდება. ფინიშზე თქვენი ქულები და შედეგი ამ მონაცემებს დაუკავშირდება.</p>
      <form class="team-form" onSubmit={submit}>
        <label>
          გუნდის სახელი
          <input
            value={name}
            autoComplete="off"
            maxLength={40}
            onInput={(event) => {
              setName(event.currentTarget.value)
              setRejected(false)
            }}
          />
        </label>
        <label>
          გუნდის კოდი
          <input
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={12}
            onInput={(event) => {
              setCode(event.currentTarget.value)
              setRejected(false)
            }}
          />
        </label>
        <p class="team-hint">კოდი არის 2–12 ლათინური ასო ან ციფრი. სახელი შეიძლება ქართულად იყოს.</p>
        {rejected && (
          <p class="play-warning" role="status">
            კოდი ან სახელი ამ ფორმას არ ერგება.
          </p>
        )}
        <button type="submit" class="map-open" disabled={!team}>
          შესვლა
        </button>
      </form>
    </main>
  )
}
