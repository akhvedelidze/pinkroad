import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bearing } from '@turf/bearing'
import { distanceMeters } from '../src/content/bearing.ts'

type Point = { lat: number; lon: number }

type Source = {
  type: string
  tags?: Record<string, string>
  geometry?: Point[]
}

export type StreetLabel = {
  name: string
  lat: number
  lng: number
  kind: 'street'
  angle: number
}

const STREETS = [
  { match: 'ფრიდონ ხალვაშის გამზირი', label: 'ხალვაშის' },
  { match: 'თამარ მეფის გამზირი', label: 'თამარ მეფის' },
  { match: 'პეტრე ბაგრატიონის ქუჩა', label: 'ბაგრატიონის' },
  { match: 'შოთა რუსთაველის ქუჩა', label: 'რუსთაველის' },
  { match: 'ილია ჭავჭავაძის ქუჩა', label: 'ჭავჭავაძის' },
  { match: 'შერიფ ხიმშიაშვილის ქუჩა', label: 'ხიმშიაშვილის' },
  { match: 'ზურაბ გორგილაძის ქუჩა', label: 'გორგილაძის' },
  { match: 'თბილისის ქუჩა', label: 'თბილისის' },
  { match: 'ბაქოს ქუჩა', label: 'ბაქოს' },
  { match: 'ჟიული შარტავას გამზირი', label: 'შარტავას' },
  { match: 'აეროპორტის გზატკეცილი', label: 'აეროპორტის გზა' },
  { match: 'ალექსანდრე პუშკინის ქუჩა', label: 'პუშკინის' },
  { match: 'ტბელ აბუსერისძის ქუჩა', label: 'აბუსერისძის' },
  { match: 'ეგნატე ნინოშვილის ქუჩა', label: 'ნინოშვილის' },
  { match: 'მემედ აბაშიძის ქუჩა', label: 'მემედ აბაშიძის' },
]

const SPACING_M = 1100
const MIN_GAP_M = 700

export function streetLabels(elements: Source[]): StreetLabel[] {
  const labels: StreetLabel[] = []
  for (const street of STREETS) {
    const lines = elements
      .filter((item) => item.type === 'way' && roadName(item) === street.match && (item.geometry?.length ?? 0) > 1)
      .map((item) => item.geometry as Point[])
    const chosen: Array<{ lat: number; lng: number }> = []
    for (const line of lines) {
      const length = polylineLength(line)
      const stops = length < 500 ? [length / 2] : stopsAlong(length)
      for (const distance of stops) {
        const spot = pointAlong(line, distance)
        if (!spot) continue
        const here = { lat: spot.lat, lng: spot.lon }
        if (chosen.some((item) => distanceMeters(item, here) < MIN_GAP_M)) continue
        chosen.push(here)
        labels.push({
          name: street.label,
          lat: round(here.lat),
          lng: round(here.lng),
          kind: 'street',
          angle: labelAngle(spot.bearing),
        })
        if (chosen.length >= 4) break
      }
      if (chosen.length >= 4) break
    }
  }
  return labels
}

function roadName(item: Source): string {
  return (item.tags?.['name:ka'] || item.tags?.name || '').normalize('NFC').trim()
}

function stopsAlong(length: number): number[] {
  const stops: number[] = []
  for (let distance = 400; distance < length - 150; distance += SPACING_M) stops.push(distance)
  if (stops.length === 0) stops.push(length / 2)
  return stops
}

function polylineLength(line: Point[]): number {
  let total = 0
  for (let index = 1; index < line.length; index += 1) {
    total += segmentLength(line[index - 1], line[index])
  }
  return total
}

function pointAlong(line: Point[], target: number): { lat: number; lon: number; bearing: number } | null {
  let walked = 0
  for (let index = 1; index < line.length; index += 1) {
    const from = line[index - 1]
    const to = line[index]
    const length = segmentLength(from, to)
    if (walked + length >= target && length > 0) {
      const ratio = (target - walked) / length
      return {
        lat: from.lat + (to.lat - from.lat) * ratio,
        lon: from.lon + (to.lon - from.lon) * ratio,
        bearing: bearing([from.lon, from.lat], [to.lon, to.lat]),
      }
    }
    walked += length
  }
  const last = line.at(-1)
  const prev = line.at(-2)
  if (!last || !prev) return null
  return { lat: last.lat, lon: last.lon, bearing: bearing([prev.lon, prev.lat], [last.lon, last.lat]) }
}

function segmentLength(from: Point, to: Point): number {
  return distanceMeters({ lat: from.lat, lng: from.lon }, { lat: to.lat, lng: to.lon })
}

function labelAngle(degrees: number): number {
  let angle = degrees - 90
  while (angle > 90) angle -= 180
  while (angle < -90) angle += 180
  return Math.round(angle)
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

const isDirect = process.argv[1]?.includes('street-labels')
if (isDirect) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const source = JSON.parse(readFileSync(path.join(root, 'scripts', '.cache', 'features.json'), 'utf8')) as {
    elements: Source[]
  }
  const labels = streetLabels(source.elements)
  writeFileSync(path.join(root, 'public', 'map', 'streets.json'), `${JSON.stringify(labels, null, 2)}\n`)
  console.log('streets', labels.length, [...new Set(labels.map((item) => item.name))].join(', '))
}
