import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { latLngToPixel, pixelToLatLng, type MapFrame } from '../geo/mercator.ts'
import { publicUrl } from '../publicUrl.ts'

type MapMeta = MapFrame & {
  tileSize: number
  overviewWidth: number
}

type Label = { name: string; lat: number; lng: number; kind?: string; angle?: number }

type CheckPoint = {
  id: string
  name: string
  lat: number
  lng: number
  verified: boolean
}

type View = { scale: number; originX: number; originY: number }
type Stage = { w: number; h: number }

const MAX_SCALE = 1
const TAP_PX = 12
const STREET_SCALE = 0.16

type Guess = { lat: number; lng: number }

export function MapView({
  onBack,
  title = 'ბათუმის რუკა',
  showCheck = true,
  banner,
  footer,
  guess = null,
  onTap,
  route = [],
  routeDraw = 1,
  radius = null,
}: {
  onBack: () => void
  title?: string
  showCheck?: boolean
  banner?: ComponentChildren
  footer?: ComponentChildren
  guess?: Guess | null
  onTap?: (point: Guess) => void
  route?: Guess[]
  routeDraw?: number
  radius?: (Guess & { meters: number }) | null
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View>({ scale: 1, originX: 0, originY: 0 })
  const stageSize = useRef<Stage>({ w: 0, h: 0 })
  const metaRef = useRef<MapMeta | null>(null)
  const overviewRef = useRef<HTMLImageElement | null>(null)
  const tilesRef = useRef(new Map<string, HTMLImageElement>())
  const checksRef = useRef<CheckPoint[]>([])
  const pointers = useRef(new Map<number, { x: number; y: number; originX: number; originY: number }>())
  const pinched = useRef(false)
  const onTapRef = useRef(onTap)
  onTapRef.current = onTap
  const pinchDistance = useRef(0)
  const fitted = useRef(false)

  const [meta, setMeta] = useState<MapMeta | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [stage, setStage] = useState<Stage>({ w: 0, h: 0 })
  const [labels, setLabels] = useState<Label[]>([])
  const [checks, setChecks] = useState<CheckPoint[]>([])
  const [showChecks, setShowChecks] = useState(false)
  const [error, setError] = useState('')
  const [paint, setPaint] = useState(0)

  function commit(next: View) {
    const current = metaRef.current
    const size = stageSize.current
    const clamped = current && size.w > 0 ? clampView(next, current, size) : next
    viewRef.current = clamped
    setView({ ...clamped })
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(publicUrl('map/meta.json')).then((response) => response.json()),
      fetch(publicUrl('map/labels.json')).then((response) => response.json()),
      fetch(publicUrl('map/streets.json')).then((response) => (response.ok ? response.json() : [])),
      fetch(publicUrl('map/check-points.json')).then((response) => response.json()),
    ])
      .then(([nextMeta, nextLabels, nextStreets, nextChecks]: [MapMeta, Label[], Label[], CheckPoint[]]) => {
        if (cancelled) return
        metaRef.current = nextMeta
        checksRef.current = nextChecks
        setMeta(nextMeta)
        setLabels([...nextLabels, ...nextStreets])
        setChecks(nextChecks)
        const image = new Image()
        image.decoding = 'async'
        image.src = publicUrl('map/overview.png')
        image.onload = () => {
          overviewRef.current = image
          setPaint((value) => value + 1)
        }
      })
      .catch(() => {
        if (!cancelled) setError('რუკა ვერ ჩაიტვირთა')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect()
      const size = { w: rect.width, h: rect.height }
      stageSize.current = size
      setStage(size)
      const current = metaRef.current
      if (!current || size.w === 0) return
      if (!fitted.current) {
        fitted.current = true
        commit(fitView(current, size))
      } else {
        commit(viewRef.current)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [meta])

  useEffect(() => {
    const element = stageRef.current
    if (!element || !meta) return

    function localPoint(clientX: number, clientY: number) {
      const rect = element!.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    }

    function activePointers() {
      return [...pointers.current.values()]
    }

    function zoomAt(x: number, y: number, factor: number) {
      const current = viewRef.current
      const frame = metaRef.current
      const size = stageSize.current
      if (!frame || size.w === 0) return
      const scale = Math.min(MAX_SCALE, Math.max(fitScale(frame, size), current.scale * factor))
      const mapX = current.originX + x / current.scale
      const mapY = current.originY + y / current.scale
      commit({ scale, originX: mapX - x / scale, originY: mapY - y / scale })
    }

    function onDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest('button')) return
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        originX: event.clientX,
        originY: event.clientY,
      })
      try {
        element!.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture is unavailable for this event. Pan still tracks the pointer.
      }
      const points = activePointers()
      pinchDistance.current =
        points.length >= 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0
    }

    function onMove(event: PointerEvent) {
      if (!pointers.current.has(event.pointerId)) return
      event.preventDefault()
      const previous = pointers.current.get(event.pointerId)!
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        originX: previous.originX,
        originY: previous.originY,
      })
      const points = activePointers()
      if (points.length >= 2) {
        pinched.current = true
        const nextSpan = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
        const previousSpan = pinchDistance.current
        if (previousSpan > 0 && nextSpan > 0) {
          const mid = localPoint((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2)
          zoomAt(mid.x, mid.y, nextSpan / previousSpan)
        }
        pinchDistance.current = nextSpan
        return
      }
      if (Math.hypot(event.clientX - previous.originX, event.clientY - previous.originY) <= TAP_PX) return
      const current = viewRef.current
      commit({
        ...current,
        originX: current.originX - (event.clientX - previous.x) / current.scale,
        originY: current.originY - (event.clientY - previous.y) / current.scale,
      })
    }

    function onUp(event: PointerEvent) {
      const start = pointers.current.get(event.pointerId)
      pointers.current.delete(event.pointerId)
      const points = activePointers()
      pinchDistance.current =
        points.length >= 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0
      if (points.length > 0 || !start) return
      const wasPinch = pinched.current
      pinched.current = false
      if (wasPinch || !onTapRef.current) return
      if (Math.hypot(event.clientX - start.originX, event.clientY - start.originY) > TAP_PX) return
      const frame = metaRef.current
      if (!frame) return
      const local = localPoint(start.originX, start.originY)
      const view = viewRef.current
      onTapRef.current(
        pixelToLatLng(view.originX + local.x / view.scale, view.originY + local.y / view.scale, frame),
      )
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault()
      const local = localPoint(event.clientX, event.clientY)
      zoomAt(local.x, local.y, event.deltaY < 0 ? 1.18 : 1 / 1.18)
    }

    element.addEventListener('pointerdown', onDown)
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointercancel', onUp)
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('pointerdown', onDown)
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointercancel', onUp)
      element.removeEventListener('wheel', onWheel)
    }
  }, [meta])

  useEffect(() => {
    if (!meta || !view) return
    drawMap({
      canvas: canvasRef.current,
      meta,
      view,
      overview: overviewRef.current,
      tiles: tilesRef.current,
      checks: showChecks ? checksRef.current : [],
      guess,
      route,
      routeDraw,
      radius,
      onTile: () => setPaint((value) => value + 1),
    })
  }, [meta, view, showChecks, paint, guess, route, routeDraw, radius])

  function fitToPoints(points: CheckPoint[]) {
    const frame = metaRef.current
    const size = stageSize.current
    if (!frame || points.length === 0 || size.w === 0) return
    const pixels = points.map((point) => latLngToPixel(point.lat, point.lng, frame))
    let minX = Math.min(...pixels.map((point) => point.x))
    let maxX = Math.max(...pixels.map((point) => point.x))
    let minY = Math.min(...pixels.map((point) => point.y))
    let maxY = Math.max(...pixels.map((point) => point.y))
    const padX = Math.max(120, (maxX - minX) * 0.45)
    const padY = Math.max(120, (maxY - minY) * 0.45)
    minX -= padX
    maxX += padX
    minY -= padY
    maxY += padY
    const scale = Math.min(MAX_SCALE, size.w / (maxX - minX), size.h / (maxY - minY))
    commit({
      scale,
      originX: (minX + maxX) / 2 - size.w / scale / 2,
      originY: (minY + maxY) / 2 - size.h / scale / 2,
    })
  }

  function toggleChecks() {
    const next = !showChecks
    setShowChecks(next)
    const frame = metaRef.current
    if (!frame) return
    if (next) fitToPoints(checksRef.current)
    else commit(fitView(frame, stageSize.current))
  }

  function zoomFromButton(factor: number) {
    const size = stageSize.current
    const current = viewRef.current
    const frame = metaRef.current
    if (!frame || size.w === 0) return
    const scale = Math.min(MAX_SCALE, Math.max(fitScale(frame, size), current.scale * factor))
    const midX = size.w / 2
    const midY = size.h / 2
    const mapX = current.originX + midX / current.scale
    const mapY = current.originY + midY / current.scale
    commit({ scale, originX: mapX - midX / scale, originY: mapY - midY / scale })
  }

  const placed =
    meta && view ? placeLabels(meta, view, stage, labels, showChecks ? checks : []) : []

  return (
    <section class="map-screen">
      <div class="map-bar">
        <button type="button" class="map-back" onClick={onBack}>
          უკან
        </button>
        <h1 class="map-title">{title}</h1>
        {showCheck ? (
          <button
            type="button"
            class={showChecks ? 'check-btn is-on' : 'check-btn'}
            aria-pressed={showChecks}
            onClick={toggleChecks}
          >
            შემოწმება
          </button>
        ) : null}
      </div>
      {banner}
      <div class="map-stage" ref={stageRef}>
        <canvas ref={canvasRef} aria-label="ბათუმის რუკა" />
        {placed.map((item) => (
          <span
            key={item.key}
            class={item.numbered ? 'map-label map-pin-label' : item.street ? 'map-label map-street' : 'map-label'}
            style={{
              left: `${item.x}px`,
              top: `${item.y}px`,
              transform: item.street ? `translate(-50%, -50%) rotate(${item.angle}deg)` : undefined,
            }}
          >
            {item.name}
          </span>
        ))}
        <div class="map-tools">
          <button type="button" class="zoom-btn" aria-label="გადიდება" onClick={() => zoomFromButton(1.4)}>
            +
          </button>
          <button type="button" class="zoom-btn" aria-label="დაპატარავება" onClick={() => zoomFromButton(1 / 1.4)}>
            −
          </button>
        </div>
        {showChecks && (
          <ol class="check-legend">
            {checks.map((point, index) => (
              <li key={point.id}>
                <span>{index + 1}</span>
                {point.name}
              </li>
            ))}
          </ol>
        )}
        <p class="map-attrib">© OpenStreetMap contributors</p>
        {error && <p class="map-error">{error}</p>}
      </div>
      {footer}
    </section>
  )
}

function fitScale(frame: MapFrame, stage: Stage) {
  if (stage.w === 0 || stage.h === 0) return 1
  return Math.min(stage.w / frame.width, stage.h / frame.height)
}

function fitView(frame: MapFrame, stage: Stage): View {
  const scale = fitScale(frame, stage)
  return {
    scale,
    originX: (frame.width - stage.w / scale) / 2,
    originY: (frame.height - stage.h / scale) / 2,
  }
}

function clampView(view: View, frame: MapFrame, stage: Stage): View {
  const scale = Math.min(MAX_SCALE, Math.max(fitScale(frame, stage), view.scale))
  const viewW = stage.w / scale
  const viewH = stage.h / scale
  return {
    scale,
    originX: viewW >= frame.width ? (frame.width - viewW) / 2 : clamp(view.originX, 0, frame.width - viewW),
    originY: viewH >= frame.height ? (frame.height - viewH) / 2 : clamp(view.originY, 0, frame.height - viewH),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function placeLabels(
  frame: MapFrame,
  view: View,
  stage: Stage,
  labels: Label[],
  checks: CheckPoint[],
) {
  const placed: Array<{ key: string; name: string; x: number; y: number; numbered: boolean; street: boolean; angle: number }> = []
  const occupied: Array<{ x: number; y: number }> = []

  function accept(
    key: string,
    name: string,
    lat: number,
    lng: number,
    numbered: boolean,
    gap: number,
    street = false,
    angle = 0,
  ) {
    if (street && view.scale < STREET_SCALE) return
    const pixel = latLngToPixel(lat, lng, frame)
    const x = (pixel.x - view.originX) * view.scale
    const y = (pixel.y - view.originY) * view.scale
    if (x < -20 || y < -12 || x > stage.w + 20 || y > stage.h + 12) return
    if (occupied.some((item) => Math.hypot(item.x - x, item.y - y) < gap)) return
    occupied.push({ x, y })
    placed.push({ key, name, x, y, numbered, street, angle })
  }

  checks.forEach((point, index) => {
    accept(point.id, `${index + 1}. ${point.name}`, point.lat, point.lng, true, 24)
  })
  for (const label of labels) {
    const street = label.kind === 'street'
    accept(
      `${label.kind ?? 'place'}-${label.name}-${label.lat}`,
      label.name,
      label.lat,
      label.lng,
      false,
      street ? 72 : 64,
      street,
      label.angle ?? 0,
    )
  }
  return placed
}

function drawMap(options: {
  canvas: HTMLCanvasElement | null
  meta: MapMeta
  view: View
  overview: HTMLImageElement | null
  tiles: Map<string, HTMLImageElement>
  checks: CheckPoint[]
  guess: Guess | null
  route: Guess[]
  routeDraw: number
  radius: (Guess & { meters: number }) | null
  onTile: () => void
}) {
  const { canvas, meta, view, overview, tiles, checks, guess, route, routeDraw, radius, onTile } = options
  if (!canvas) return
  const stage = canvas.parentElement
  if (!stage) return
  const rect = stage.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.max(1, Math.round(rect.width * dpr))
  canvas.height = Math.max(1, Math.round(rect.height * dpr))
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.fillStyle = '#e7a4bc'
  context.fillRect(0, 0, rect.width, rect.height)

  if (overview) {
    context.drawImage(
      overview,
      -view.originX * view.scale,
      -view.originY * view.scale,
      meta.width * view.scale,
      meta.height * view.scale,
    )
  }

  if (view.scale / (meta.overviewWidth / meta.width) > 1.15) {
    const right = view.originX + rect.width / view.scale
    const bottom = view.originY + rect.height / view.scale
    const x0 = Math.max(0, Math.floor(view.originX / meta.tileSize))
    const y0 = Math.max(0, Math.floor(view.originY / meta.tileSize))
    const x1 = Math.floor(right / meta.tileSize)
    const y1 = Math.floor(bottom / meta.tileSize)
    for (let tileY = y0; tileY <= y1; tileY += 1) {
      for (let tileX = x0; tileX <= x1; tileX += 1) {
        const key = `${tileX}/${tileY}`
        const image = tiles.get(key)
        if (!image || !image.complete || image.naturalWidth === 0) {
          if (!image) {
            const next = new Image()
            next.decoding = 'async'
            next.src = publicUrl(`map/tiles/${tileX}/${tileY}.png`)
            next.onload = onTile
            tiles.set(key, next)
          }
          continue
        }
        context.drawImage(
          image,
          (tileX * meta.tileSize - view.originX) * view.scale,
          (tileY * meta.tileSize - view.originY) * view.scale,
          image.naturalWidth * view.scale,
          image.naturalHeight * view.scale,
        )
      }
    }
  }

  checks.forEach((point, index) => {
    const pixel = latLngToPixel(point.lat, point.lng, meta)
    const x = (pixel.x - view.originX) * view.scale
    const y = (pixel.y - view.originY) * view.scale
    context.beginPath()
    context.arc(x, y, 13, 0, Math.PI * 2)
    context.fillStyle = '#0a2f6b'
    context.fill()
    context.lineWidth = 3
    context.strokeStyle = '#ffffff'
    context.stroke()
    context.fillStyle = '#ffffff'
    context.font = '700 13px sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(String(index + 1), x, y + 0.5)
  })

  drawRoute(context, meta, view, route, routeDraw)
  drawRadius(context, meta, view, radius)

  if (guess) {
    const pixel = latLngToPixel(guess.lat, guess.lng, meta)
    const x = (pixel.x - view.originX) * view.scale
    const y = (pixel.y - view.originY) * view.scale
    context.beginPath()
    context.arc(x, y, 12, 0, Math.PI * 2)
    context.fillStyle = '#d6457a'
    context.fill()
    context.lineWidth = 3
    context.strokeStyle = '#ffffff'
    context.stroke()
  }
}

function drawRadius(
  context: CanvasRenderingContext2D,
  meta: MapMeta,
  view: View,
  radius: (Guess & { meters: number }) | null,
) {
  if (!radius || radius.meters <= 0) return
  const pixel = latLngToPixel(radius.lat, radius.lng, meta)
  const north = latLngToPixel(radius.lat + radius.meters / 111320, radius.lng, meta)
  const x = (pixel.x - view.originX) * view.scale
  const y = (pixel.y - view.originY) * view.scale
  const px = Math.hypot(pixel.x - north.x, pixel.y - north.y) * view.scale
  context.beginPath()
  context.arc(x, y, px, 0, Math.PI * 2)
  context.lineWidth = 2
  context.strokeStyle = '#0a2f6b'
  context.setLineDash([6, 4])
  context.stroke()
  context.setLineDash([])
}

function drawRoute(
  context: CanvasRenderingContext2D,
  meta: MapMeta,
  view: View,
  route: Guess[],
  routeDraw: number,
) {
  if (route.length === 0) return
  const screen = route.map((point) => {
    const pixel = latLngToPixel(point.lat, point.lng, meta)
    return {
      x: (pixel.x - view.originX) * view.scale,
      y: (pixel.y - view.originY) * view.scale,
    }
  })
  context.lineWidth = 4
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = '#d6457a'
  context.beginPath()
  context.moveTo(screen[0].x, screen[0].y)
  for (let index = 1; index < screen.length - 1; index += 1) {
    context.lineTo(screen[index].x, screen[index].y)
  }
  if (screen.length >= 2) {
    const from = screen[screen.length - 2]
    const to = screen[screen.length - 1]
    const draw = Math.min(1, Math.max(0, routeDraw))
    context.lineTo(from.x + (to.x - from.x) * draw, from.y + (to.y - from.y) * draw)
  }
  if (screen.length >= 2) context.stroke()

  const visible = screen.length >= 2 && routeDraw < 1 ? screen.length - 1 : screen.length
  for (let index = 0; index < visible; index += 1) {
    context.beginPath()
    context.arc(screen[index].x, screen[index].y, 6, 0, Math.PI * 2)
    context.fillStyle = '#d6457a'
    context.fill()
    context.lineWidth = 2
    context.strokeStyle = '#ffffff'
    context.stroke()
  }
}
