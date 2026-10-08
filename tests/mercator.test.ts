import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { frameForWidth, latLngToPixel, pixelToLatLng, type MapFrame } from '../src/geo/mercator.ts'

const sample = frameForWidth(
  { west: 41.5594872, south: 41.5312428, east: 41.7456988, north: 41.7170258 },
  3840,
)

function maxPixelError(frame: MapFrame, points: Array<{ lat: number; lng: number }>): number {
  let max = 0
  for (const point of points) {
    const pixel = latLngToPixel(point.lat, point.lng, frame)
    const back = pixelToLatLng(pixel.x, pixel.y, frame)
    const again = latLngToPixel(back.lat, back.lng, frame)
    max = Math.max(max, Math.abs(again.x - pixel.x), Math.abs(again.y - pixel.y))
  }
  return max
}

function gridPoints(frame: MapFrame): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = []
  for (let row = 0; row <= 8; row += 1) {
    for (let col = 0; col <= 8; col += 1) {
      const x = (frame.width * col) / 8
      const y = (frame.height * row) / 8
      points.push(pixelToLatLng(x, y, frame))
    }
  }
  return points
}

describe('Web Mercator pixel conversion', () => {
  it('maps the northwest and southeast corners to the image edges', () => {
    const nw = latLngToPixel(sample.north, sample.west, sample)
    const se = latLngToPixel(sample.south, sample.east, sample)
    expect(nw.x).toBeCloseTo(0, 6)
    expect(nw.y).toBeCloseTo(0, 6)
    expect(se.x).toBeCloseTo(sample.width, 6)
    expect(se.y).toBeCloseTo(sample.height, 6)
  })

  it('round-trips pixel → lat/lng → pixel within 1px', () => {
    const error = maxPixelError(sample, gridPoints(sample))
    expect(error).toBeLessThanOrEqual(1)
    expect(error).toBeLessThan(0.01)
  })

  it('round-trips the rendered Batumi frame within 1px', () => {
    const meta = JSON.parse(
      readFileSync(new URL('../public/map/meta.json', import.meta.url), 'utf8'),
    ) as MapFrame
    const error = maxPixelError(meta, [
      ...gridPoints(meta),
      { lat: meta.north, lng: meta.west },
      { lat: meta.south, lng: meta.east },
      { lat: (meta.north + meta.south) / 2, lng: (meta.west + meta.east) / 2 },
    ])
    expect(meta.width).toBeGreaterThanOrEqual(3000)
    expect(meta.width).toBeLessThanOrEqual(4000)
    expect(error).toBeLessThanOrEqual(1)
    expect(error).toBeLessThan(0.01)
  })
})
