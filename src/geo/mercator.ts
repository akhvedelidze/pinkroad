export type MapFrame = {
  west: number
  south: number
  east: number
  north: number
  width: number
  height: number
}

const MAX_LAT = 85.0511287798

/** Web Mercator X in the 0..1 world range used by OSM tiles. */
export function mercatorX(lng: number): number {
  return (lng + 180) / 360
}

/** Web Mercator Y in the 0..1 world range. North is smaller. */
export function mercatorY(lat: number): number {
  const clamped = Math.min(MAX_LAT, Math.max(-MAX_LAT, lat))
  const sin = Math.sin((clamped * Math.PI) / 180)
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
}

export function frameForWidth(
  bounds: Pick<MapFrame, 'west' | 'south' | 'east' | 'north'>,
  width: number,
): MapFrame {
  const xSpan = mercatorX(bounds.east) - mercatorX(bounds.west)
  const ySpan = mercatorY(bounds.south) - mercatorY(bounds.north)
  const height = Math.max(1, Math.round((width * ySpan) / xSpan))
  return { ...bounds, width, height }
}

export function latLngToPixel(lat: number, lng: number, frame: MapFrame): { x: number; y: number } {
  const x0 = mercatorX(frame.west)
  const x1 = mercatorX(frame.east)
  const y0 = mercatorY(frame.north)
  const y1 = mercatorY(frame.south)
  return {
    x: ((mercatorX(lng) - x0) / (x1 - x0)) * frame.width,
    y: ((mercatorY(lat) - y0) / (y1 - y0)) * frame.height,
  }
}

export function pixelToLatLng(x: number, y: number, frame: MapFrame): { lat: number; lng: number } {
  const x0 = mercatorX(frame.west)
  const x1 = mercatorX(frame.east)
  const y0 = mercatorY(frame.north)
  const y1 = mercatorY(frame.south)
  const mx = x0 + (x / frame.width) * (x1 - x0)
  const my = y0 + (y / frame.height) * (y1 - y0)
  const lng = mx * 360 - 180
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * my)))
  return { lat, lng }
}
