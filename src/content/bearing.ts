import { bearing } from '@turf/bearing'
import { distance } from '@turf/distance'

const DIRECTIONS: Array<[number, string]> = [
  [22.5, 'ჩრდილოეთით'],
  [67.5, 'ჩრდილო-აღმოსავლეთით'],
  [112.5, 'აღმოსავლეთით'],
  [157.5, 'სამხრეთ-აღმოსავლეთით'],
  [202.5, 'სამხრეთით'],
  [247.5, 'სამხრეთ-დასავლეთით'],
  [292.5, 'დასავლეთით'],
  [337.5, 'ჩრდილო-დასავლეთით'],
  [360, 'ჩრდილოეთით'],
]

export function bearingText(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360
  for (const [limit, label] of DIRECTIONS) {
    if (normalized < limit) return label
  }
  return 'ჩრდილოეთით'
}

export function distanceMeters(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  return distance([from.lng, from.lat], [to.lng, to.lat], { units: 'meters' })
}

export function fromPrevious(
  previous: { lat: number; lng: number },
  next: { lat: number; lng: number },
): { bearingText: string; distanceM: number } {
  return {
    bearingText: bearingText(bearing([previous.lng, previous.lat], [next.lng, next.lat])),
    distanceM: Math.round(distanceMeters(previous, next)),
  }
}
