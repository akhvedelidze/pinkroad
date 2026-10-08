import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { streetLabels } from './street-labels.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = path.join(root, 'scripts', '.cache')
const mapDir = path.join(root, 'public', 'map')
const tileDir = path.join(mapDir, 'tiles')

const USER_AGENT = 'PinkRouteBatumi/0.1 (local educational map render)'
const MAP_WIDTH = 3840
const TILE_SIZE = 512
const OVERVIEW_WIDTH = 960

const SEA = '#e7a4bc'
const LAND = '#fde8ef'
const PARK = '#d7e7cb'
const FOREST = '#c5d8b4'
const WATER = '#d5e6f5'
const ROAD = '#ffffff'
const SHORE = '#d9789c'

const ROAD_WIDTH: Record<string, number> = {
  motorway: 26,
  trunk: 26,
  primary: 20,
  secondary: 12,
  tertiary: 6,
  unclassified: 2,
  residential: 2,
  living_street: 2,
  pedestrian: 2.5,
}

type LonLat = [number, number]

type NominatimSearch = {
  osm_type: string
  osm_id: number
  lat: string
  lon: string
  name?: string
  display_name?: string
  boundingbox?: [string, string, string, string]
  category?: string
  type?: string
  geojson?: { type: string; coordinates: unknown }
}

type OsmPoint = { lat: number; lon: number }

type OsmElement = {
  type: string
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: OsmPoint[]
  members?: Array<{ role?: string; geometry?: OsmPoint[] }>
}

const CHECKS = [
  { id: 'lighthouse', queries: ['ბათუმის შუქურა', 'Batumi Lighthouse'] },
  { id: 'alphabet', queries: ['ანბანის კოშკი', 'Alphabetic Tower'] },
  { id: 'nurigeli', queries: ['ნურიგელის ტბა', 'Nurigeli'] },
  { id: 'airport', queries: ['ბათუმის აეროპორტი', 'Batumi International Airport'] },
  { id: 'dolphinarium', queries: ['დელფინარიუმი ბათუმი', 'Batumi Dolphinarium'] },
  { id: 'fountains', queries: ['Dancing Fountains Batumi'] },
  { id: 'acibadem', queries: ['Zurab Gorgiladze 2 Batumi', 'ზურაბ გორგილაძის 2 ბათუმი'] },
  { id: 'cityhall', queries: ['ბათუმის მერია', 'Batumi City Hall'] },
  { id: 'seaport', queries: ['ბათუმის საზღვაო ნავსადგური', 'Batumi Sea Port'] },
]

async function main() {
  await mkdir(cacheDir, { recursive: true })
  await mkdir(tileDir, { recursive: true })

  const city = await loadJson<NominatimSearch[]>('city.json', () => searchCity())
  const hit = city[0]
  if (!hit || hit.osm_type !== 'relation') {
    throw new Error('Nominatim did not return a Batumi relation')
  }

  const bounds = boundsFromNominatim(hit)
  const frame = frameForWidth(bounds, MAP_WIDTH)
  assertRoundTrip(frame)

  const polygon = await loadJson<NominatimSearch[]>('city-polygon.json', () =>
    lookupPolygon(hit.osm_type, hit.osm_id),
  )
  const geojson = polygon[0]?.geojson
  if (!geojson) throw new Error('Nominatim did not return a city polygon')

  const overpass = await loadJson<{ elements: OsmElement[] }>('features.json', () =>
    fetchFeatures(bounds),
  )

  const checks = await loadJson('check-points.json', () => fetchChecks(bounds))
  const labels = districtLabels(overpass.elements, frame)

  console.log(`Rendering ${frame.width}x${frame.height} from ${overpass.elements.length} features`)
  const svg = buildSvg(frame, geojson, overpass.elements)
  console.log(`SVG ${(svg.length / 1024 / 1024).toFixed(1)} MB`)
  const png = renderSvg(svg, frame.width)
  console.log(`PNG ${(png.length / 1024 / 1024).toFixed(1)} MB, writing tiles`)
  await writeOverviewAndTiles(png, frame)

  const meta = {
    ...frame,
    tileSize: TILE_SIZE,
    overviewWidth: OVERVIEW_WIDTH,
    source: `OpenStreetMap ${hit.osm_type} ${hit.osm_id} via Nominatim`,
    retrieved: new Date().toISOString(),
    verified: false,
  }
  await writeFile(path.join(mapDir, 'meta.json'), JSON.stringify(meta, null, 2))
  await writeFile(path.join(mapDir, 'labels.json'), JSON.stringify(labels, null, 2))
  await writeFile(path.join(mapDir, 'streets.json'), JSON.stringify(streetLabels(overpass.elements), null, 2))
  await writeFile(path.join(mapDir, 'check-points.json'), JSON.stringify(checks, null, 2))

  console.log(
    JSON.stringify(
      {
        frame,
        roads: overpass.elements.filter((item) => item.tags?.highway).length,
        labels: labels.length,
        checks: checks.map((item) => ({
          id: item.id,
          name: item.name,
          osm: `${item.osmType} ${item.osmId}`,
          lat: item.lat,
          lng: item.lng,
          verified: item.verified,
        })),
      },
      null,
      2,
    ),
  )
}

function boundsFromNominatim(hit: NominatimSearch) {
  const box = hit.boundingbox
  if (!box) throw new Error('Nominatim result has no bounding box')
  const south = Number(box[0])
  const north = Number(box[1])
  const west = Number(box[2])
  const east = Number(box[3])
  if (![south, north, west, east].every(Number.isFinite)) {
    throw new Error('Nominatim bounding box is not numeric')
  }
  return { south, north, west, east }
}

function assertRoundTrip(frame: MapFrame) {
  const pixel = latLngToPixel((frame.north + frame.south) / 2, (frame.west + frame.east) / 2, frame)
  const back = pixelToLatLng(pixel.x, pixel.y, frame)
  const again = latLngToPixel(back.lat, back.lng, frame)
  const error = Math.max(Math.abs(again.x - pixel.x), Math.abs(again.y - pixel.y))
  if (error > 0.01) throw new Error(`Projection round-trip error is ${error}px`)
}

async function searchCity(): Promise<NominatimSearch[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('city', 'Batumi')
  url.searchParams.set('country', 'Georgia')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  return getJson(url)
}

async function lookupPolygon(osmType: string, osmId: number): Promise<NominatimSearch[]> {
  await pause()
  const prefix = osmType === 'relation' ? 'R' : osmType === 'way' ? 'W' : 'N'
  const url = new URL('https://nominatim.openstreetmap.org/lookup')
  url.searchParams.set('osm_ids', `${prefix}${osmId}`)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('polygon_geojson', '1')
  return getJson(url)
}

async function fetchFeatures(bounds: { south: number; west: number; north: number; east: number }) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
  const query = `
    [out:json][timeout:180];
    (
      way["natural"="coastline"](${bbox});
      way["natural"="water"](${bbox});
      way["natural"="wood"](${bbox});
      way["landuse"~"^(forest|grass|meadow|recreation_ground)$"](${bbox});
      way["leisure"~"^(park|garden)$"](${bbox});
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian)$"](${bbox});
      way["waterway"="river"](${bbox});
      node["place"~"^(suburb|neighbourhood|quarter|village)$"](${bbox});
    );
    out geom;
  `
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]
  let lastError: unknown
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(180000),
      })
      if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`)
      return (await response.json()) as { elements: OsmElement[] }
    } catch (error) {
      lastError = error
      console.warn(`Overpass failed at ${endpoint}`)
    }
  }
  throw lastError
}

async function fetchChecks(bounds: { south: number; west: number; north: number; east: number }) {
  const points = []
  for (const check of CHECKS) {
    let found: NominatimSearch | null = null
    let matchedQuery = ''
    for (const query of check.queries) {
      await pause()
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('q', query)
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('limit', '5')
      url.searchParams.set('countrycodes', 'ge')
      const results = await getJson<NominatimSearch[]>(url)
      found = results.find((item) => insideBounds(item, bounds)) ?? null
      if (found) {
        matchedQuery = query
        break
      }
    }
    if (!found) throw new Error(`No OSM result inside Batumi for ${check.id}`)
    points.push({
      id: check.id,
      name: found.name || found.display_name || check.id,
      displayName: found.display_name ?? '',
      query: matchedQuery,
      lat: Number(found.lat),
      lng: Number(found.lon),
      osmType: found.osm_type,
      osmId: found.osm_id,
      source: 'Nominatim',
      verified: check.id === 'lighthouse' || check.id === 'alphabet' || check.id === 'nurigeli',
    })
  }
  return points
}

function insideBounds(
  item: NominatimSearch,
  bounds: { south: number; west: number; north: number; east: number },
) {
  const lat = Number(item.lat)
  const lng = Number(item.lon)
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east
}

function districtLabels(elements: OsmElement[], frame: MapFrame) {
  return elements
    .filter(
      (item) =>
        item.type === 'node' &&
        item.tags?.place &&
        item.tags.place !== 'village' &&
        item.lat != null &&
        item.lon != null,
    )
    .map((item) => ({
      name: item.tags?.['name:ka'] || item.tags?.name || '',
      lat: item.lat as number,
      lng: item.lon as number,
    }))
    .filter((item) => {
      if (!item.name) return false
      const pixel = latLngToPixel(item.lat, item.lng, frame)
      return pixel.x >= 0 && pixel.y >= 0 && pixel.x <= frame.width && pixel.y <= frame.height
    })
}

function buildSvg(
  frame: MapFrame,
  geojson: { type: string; coordinates: unknown },
  elements: OsmElement[],
) {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" overflow="hidden">`,
    `<rect width="${frame.width}" height="${frame.height}" fill="${SEA}"/>`,
    `<path fill="${LAND}" stroke="${SHORE}" stroke-width="8" fill-rule="evenodd" d="${ringsToPath(landRings(geojson), frame)}"/>`,
  ]

  const areas: Array<{ color: string; rings: LonLat[][] }> = []
  const roads = new Map<number, LonLat[][]>()
  const rivers: LonLat[][] = []
  const coasts: LonLat[][] = []

  for (const element of elements) {
    const tags = element.tags ?? {}
    const lines = elementLines(element)
    if (lines.length === 0) continue
    if (tags.natural === 'coastline') coasts.push(...lines)
    else if (tags.natural === 'water') areas.push({ color: WATER, rings: lines.map(closeRing) })
    else if (tags.natural === 'wood' || tags.landuse === 'forest')
      areas.push({ color: FOREST, rings: lines.map(closeRing) })
    else if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.landuse)
      areas.push({ color: PARK, rings: lines.map(closeRing) })
    else if (tags.waterway === 'river') rivers.push(...lines)
    else if (tags.highway && ROAD_WIDTH[tags.highway]) {
      const width = ROAD_WIDTH[tags.highway]
      const group = roads.get(width) ?? []
      group.push(...lines)
      roads.set(width, group)
    }
  }

  for (const area of areas) {
    parts.push(`<path fill="${area.color}" d="${ringsToPath(area.rings, frame)}"/>`)
  }
  if (rivers.length > 0) {
    parts.push(
      `<path fill="none" stroke="${WATER}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="${linesToPath(rivers, frame)}"/>`,
    )
  }
  if (coasts.length > 0) {
    parts.push(
      `<path fill="none" stroke="${SHORE}" stroke-width="6" stroke-linecap="round" d="${linesToPath(coasts, frame)}"/>`,
    )
  }
  const widths = [...roads.keys()].sort((a, b) => a - b)
  for (const width of widths) {
    parts.push(
      `<path fill="none" stroke="${ROAD}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" d="${linesToPath(roads.get(width) ?? [], frame)}"/>`,
    )
  }
  parts.push('</svg>')
  return parts.join('')
}

function landRings(geojson: { type: string; coordinates: unknown }): LonLat[][] {
  if (geojson.type === 'Polygon') return geojson.coordinates as LonLat[][]
  if (geojson.type === 'MultiPolygon') return (geojson.coordinates as LonLat[][][]).flat()
  throw new Error(`Unsupported city geometry ${geojson.type}`)
}

function elementLines(element: OsmElement): LonLat[][] {
  if (element.geometry && element.geometry.length > 1) return [toLine(element.geometry)]
  const lines: LonLat[][] = []
  for (const member of element.members ?? []) {
    if (member.geometry && member.geometry.length > 1) lines.push(toLine(member.geometry))
  }
  return lines
}

function toLine(points: OsmPoint[]): LonLat[] {
  return points.map((point) => [point.lon, point.lat])
}

function closeRing(line: LonLat[]): LonLat[] {
  const first = line[0]
  const last = line[line.length - 1]
  if (!first || !last) return line
  if (first[0] === last[0] && first[1] === last[1]) return line
  return [...line, first]
}

function ringsToPath(rings: LonLat[][], frame: MapFrame): string {
  return rings.map((ring) => linePath(ring, frame, true)).join(' ')
}

function linesToPath(lines: LonLat[][], frame: MapFrame): string {
  return lines.map((line) => linePath(line, frame, false)).join(' ')
}

function linePath(line: LonLat[], frame: MapFrame, close: boolean): string {
  let path = ''
  let previousX = Number.NaN
  let previousY = Number.NaN
  let kept = 0
  for (let index = 0; index < line.length; index += 1) {
    const [lng, lat] = line[index]
    const point = latLngToPixel(lat, lng, frame)
    const last = index === line.length - 1
    if (
      kept > 0 &&
      !last &&
      Math.hypot(point.x - previousX, point.y - previousY) < 1.25
    ) {
      continue
    }
    path += `${kept === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    previousX = point.x
    previousY = point.y
    kept += 1
  }
  return close ? `${path}Z` : path
}

function renderSvg(svg: string, width: number): Buffer {
  const renderer = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    shapeRendering: 2,
    font: { loadSystemFonts: false },
    background: SEA,
  })
  return renderer.render().asPng()
}

async function writeOverviewAndTiles(png: Buffer, frame: MapFrame) {
  const image = sharp(png)
  await image
    .clone()
    .resize({ width: OVERVIEW_WIDTH })
    .png({ compressionLevel: 9 })
    .toFile(path.join(mapDir, 'overview.png'))

  const cols = Math.ceil(frame.width / TILE_SIZE)
  const rows = Math.ceil(frame.height / TILE_SIZE)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const left = col * TILE_SIZE
      const top = row * TILE_SIZE
      const width = Math.min(TILE_SIZE, frame.width - left)
      const height = Math.min(TILE_SIZE, frame.height - top)
      const folder = path.join(tileDir, String(col))
      await mkdir(folder, { recursive: true })
      await image
        .clone()
        .extract({ left, top, width, height })
        .png({ compressionLevel: 9 })
        .toFile(path.join(folder, `${row}.png`))
    }
  }
}

async function loadJson<T>(name: string, create: () => Promise<T>): Promise<T> {
  const file = path.join(cacheDir, name)
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    const value = await create()
    await writeFile(file, JSON.stringify(value))
    return value
  }
}

async function getJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ka,en' },
  })
  if (!response.ok) throw new Error(`${url.hostname} returned ${response.status}`)
  return (await response.json()) as T
}

function pause() {
  return new Promise((resolve) => setTimeout(resolve, 1100))
}

await main()
