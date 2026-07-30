import { useEffect, useMemo, useRef, useState } from 'react'

import type { PandaMeshResult } from './pandaMeshModel'
import {
  buildPandaMeshDrawingGeometry,
  drawPandaMesh,
  MESH_CANVAS_HEIGHT,
  MESH_CANVAS_WIDTH,
  MESH_ZOOM_MAX,
  MESH_ZOOM_MIN,
  MESH_ZOOM_STEP,
} from './pandaMeshDrawing'

type Pan = { x: number; y: number }

type PandaMeshCanvasProps = {
  result: PandaMeshResult
}

const REGION_LABELS = [
  ['cladding', 'Cladding', '#1d2b38'],
  ['core', 'Core', '#276f8e'],
  ['sap_1', 'SAP 1', '#917035'],
  ['sap_2', 'SAP 2', '#5d7d4c'],
] as const

function clampZoom(value: number) {
  return Math.min(MESH_ZOOM_MAX, Math.max(MESH_ZOOM_MIN, value))
}

function formatMicrometres(value: number) {
  return `${(value * 1e6).toFixed(3)} µm`
}

function canvasPoint(
  event:
    React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>,
) {
  const canvas = event.currentTarget
  const bounds = canvas.getBoundingClientRect()
  const width = bounds.width || MESH_CANVAS_WIDTH
  const height = bounds.height || MESH_CANVAS_HEIGHT
  return {
    x: ((event.clientX - bounds.left) / width) * MESH_CANVAS_WIDTH,
    y: ((event.clientY - bounds.top) / height) * MESH_CANVAS_HEIGHT,
  }
}

export function PandaMeshCanvas({ result }: PandaMeshCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    pan: Pan
  } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 })
  const geometry = useMemo(
    () => buildPandaMeshDrawingGeometry(result),
    [result],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    drawPandaMesh(context, geometry, { zoom, panX: pan.x, panY: pan.y })
  }, [geometry, pan, zoom])

  const updateZoomAtPoint = (
    nextZoom: number,
    point?: { x: number; y: number },
  ) => {
    const clampedZoom = clampZoom(nextZoom)
    if (point === undefined || clampedZoom === zoom) {
      setZoom(clampedZoom)
      return
    }
    const scale =
      Math.min(MESH_CANVAS_WIDTH, MESH_CANVAS_HEIGHT) /
      (2 * geometry.claddingRadiusM * 1.08)
    const modelX = (point.x - MESH_CANVAS_WIDTH / 2 - pan.x) / (scale * zoom)
    const modelY = (MESH_CANVAS_HEIGHT / 2 + pan.y - point.y) / (scale * zoom)
    setPan({
      x: point.x - MESH_CANVAS_WIDTH / 2 - modelX * scale * clampedZoom,
      y: point.y - MESH_CANVAS_HEIGHT / 2 + modelY * scale * clampedZoom,
    })
    setZoom(clampedZoom)
  }

  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pan,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const horizontalScale =
      MESH_CANVAS_WIDTH / (bounds.width || MESH_CANVAS_WIDTH)
    const verticalScale =
      MESH_CANVAS_HEIGHT / (bounds.height || MESH_CANVAS_HEIGHT)
    setPan({
      x: drag.pan.x + (event.clientX - drag.startX) * horizontalScale,
      y: drag.pan.y + (event.clientY - drag.startY) * verticalScale,
    })
  }

  const finishPointerDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const point = canvasPoint(event)
    const direction = event.deltaY < 0 ? 1 : -1
    updateZoomAtPoint(zoom * (direction > 0 ? 1.2 : 1 / 1.2), point)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      updateZoomAtPoint(zoom * 1.2)
    } else if (event.key === '-') {
      event.preventDefault()
      updateZoomAtPoint(zoom / 1.2)
    } else if (event.key === '0') {
      event.preventDefault()
      resetView()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      setPan((current) => ({
        ...current,
        x: current.x + (event.key === 'ArrowLeft' ? 24 : -24),
      }))
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      setPan((current) => ({
        ...current,
        y: current.y + (event.key === 'ArrowUp' ? 24 : -24),
      }))
    }
  }

  const extent = geometry.claddingRadiusM
  return (
    <figure className="panda-mesh-figure">
      <div className="panda-mesh-plot-heading">
        <div>
          <p className="panda-mesh-eyebrow">Figure 9.1 · 2D geometry preview</p>
          <h3>Constrained triangular PANDA mesh</h3>
        </div>
        <span>
          {result.configuration.refinement_level === 0
            ? 'Coarse'
            : `Level ${result.configuration.refinement_level}`}
        </span>
      </div>
      <div className="panda-mesh-canvas-frame">
        <canvas
          ref={canvasRef}
          width={MESH_CANVAS_WIDTH}
          height={MESH_CANVAS_HEIGHT}
          tabIndex={0}
          role="img"
          aria-label="Figure 9.1 PANDA triangular mesh preview"
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerDrag}
          onPointerCancel={finishPointerDrag}
          onWheel={handleWheel}
        />
      </div>
      <div className="panda-mesh-controls" aria-label="Mesh view controls">
        <button
          type="button"
          aria-label="Zoom out mesh"
          onClick={() => updateZoomAtPoint(zoom / 1.2)}
        >
          −
        </button>
        <label htmlFor="panda-mesh-zoom">Mesh zoom</label>
        <input
          id="panda-mesh-zoom"
          type="range"
          min={MESH_ZOOM_MIN}
          max={MESH_ZOOM_MAX}
          step={MESH_ZOOM_STEP}
          value={zoom}
          onChange={(event) => updateZoomAtPoint(Number(event.target.value))}
          aria-valuetext={`${Math.round(zoom * 100)} percent`}
        />
        <output htmlFor="panda-mesh-zoom">{Math.round(zoom * 100)}%</output>
        <button
          type="button"
          aria-label="Zoom in mesh"
          onClick={() => updateZoomAtPoint(zoom * 1.2)}
        >
          +
        </button>
        <button type="button" aria-label="Reset mesh view" onClick={resetView}>
          Reset
        </button>
      </div>
      <p className="panda-mesh-control-help">
        Drag to pan. Use the wheel, buttons, or keyboard: +/− zoom, 0 reset, and
        arrow keys pan.
      </p>
      <div className="panda-mesh-facts">
        <span>
          <strong>Extent</strong> −{formatMicrometres(extent)} to +
          {formatMicrometres(extent)}
        </span>
        <span>
          <strong>Nodes</strong> {geometry.nodeCount.toLocaleString()}
        </span>
        <span>
          <strong>Elements</strong> {geometry.elementCount.toLocaleString()}
        </span>
        <span>
          <strong>Interfaces</strong>{' '}
          {geometry.interfaceEdgeCount.toLocaleString()} shared edges
        </span>
      </div>
      <ul className="panda-mesh-legend" aria-label="Mesh region legend">
        {REGION_LABELS.map(([region, label, color]) => (
          <li key={region}>
            <span aria-hidden="true" style={{ backgroundColor: color }} />
            {label}
          </li>
        ))}
      </ul>
      <figcaption>
        Mesh preview · no solved FEM fields. This view shows the constrained
        geometry discretization only; later steps will attach FEM quantities to
        these elements.
      </figcaption>
    </figure>
  )
}
