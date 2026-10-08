import { useState } from 'preact/hooks'
import { PlayView } from './game/PlayView.tsx'
import { MapView } from './map/MapView.tsx'
import { publicUrl } from './publicUrl.ts'

const isStaging = import.meta.env.MODE === 'staging'

export function App() {
  const [screen, setScreen] = useState<'welcome' | 'map' | 'play'>('welcome')

  return (
    <div class={screen === 'welcome' ? 'shell' : 'shell shell-map'}>
      {isStaging && (
        <p class="banner" role="status">
          დაუდასტურებელი კონტენტი
        </p>
      )}
      {screen === 'map' ? (
        <MapView onBack={() => setScreen('welcome')} />
      ) : screen === 'play' ? (
        <PlayView onBack={() => setScreen('welcome')} />
      ) : (
      <main class="welcome">
        <div class="brand-row">
          <img class="brand-logo" src={publicUrl('pic/acibadem_logo.png')} alt="Acıbadem" />
          <img class="brand-logo" src={publicUrl('pic/GeOF%20logo.png')} alt="GeOF" />
        </div>
        <h1>მოგესალმებით</h1>
        <p class="event">ციფრული ბულვარი</p>
        <p class="route">ვარდისფერი მარშრუტი ბათუმში</p>
        <svg class="path" viewBox="0 0 280 28" aria-hidden="true">
          <path d="M8 14 H272" />
          <circle cx="8" cy="14" r="5" />
          <circle cx="140" cy="14" r="5" />
          <circle cx="272" cy="14" r="5" />
        </svg>
        <p class="lead">თამაში, სადაც სპორტული ორიენტირება ჯანმრთელობის სამსახურშია.</p>
        <p class="how">მინიშნებებით იპოვეთ ადგილები რუკაზე. უპასუხეთ კითხვებს და მიაღწიეთ ფინიშს!</p>
        <div class="welcome-actions">
          <button type="button" class="map-open" onClick={() => setScreen('play')}>
            თამაში
          </button>
          <button type="button" class="map-open map-open-secondary" onClick={() => setScreen('map')}>
            რუკა
          </button>
        </div>
      </main>
      )}
    </div>
  )
}
