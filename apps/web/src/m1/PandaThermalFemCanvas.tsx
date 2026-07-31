import { useEffect, useId, useMemo, useRef, useState } from 'react'

import {
  buildPandaThermalFemDrawingGeometry,
  DEFAULT_THERMAL_FEM_FIELD,
  drawPandaThermalFem,
  THERMAL_FEM_CANVAS_HEIGHT,
  THERMAL_FEM_CANVAS_WIDTH,
  THERMAL_FEM_FIELD_OPTIONS,
  THERMAL_FEM_ZOOM_MAX,
  THERMAL_FEM_ZOOM_MIN,
  THERMAL_FEM_ZOOM_STEP,
  type PandaThermalFemResult,
  type ThermalFemField,
} from './pandaThermalFemDrawing'

type Pan = { x: number; y: number }

export type PandaThermalFemCanvasProps = {
  result: PandaThermalFemResult
  initialField?: ThermalFemField
}

function clampZoom(value: number) {
  return Math.min(THERMAL_FEM_ZOOM_MAX, Math.max(THERMAL_FEM_ZOOM_MIN, value))
}

function formatScale(value: number) {
  if (value === 0) return '0'
  if (Math.abs(value) >= 100) return value.toFixed(1)
  if (Math.abs(value) >= 1) return value.toFixed(3)
  return value.toExponential(2)
}

function canvasPoint(
  event:
    React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>,
) {
  const canvas = event.currentTarget
  const bounds = canvas.getBoundingClientRect()
  const width = bounds.width || THERMAL_FEM_CANVAS_WIDTH
  const height = bounds.height || THERMAL_FEM_CANVAS_HEIGHT
  return {
    x: ((event.clientX - bounds.left) / width) * THERMAL_FEM_CANVAS_WIDTH,
    y: ((event.clientY - bounds.top) / height) * THERMAL_FEM_CANVAS_HEIGHT,
  }
}

export function PandaThermalFemCanvas({
  result,
  initialField = DEFAULT_THERMAL_FEM_FIELD,
}: PandaThermalFemCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    pan: Pan
  } | null>(null)
  const [field, setField] = useState<ThermalFemField>(initialField)
  const [showMeshEdges, setShowMeshEdges] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 })
  const fieldGeometry = useMemo(
    () => buildPandaThermalFemDrawingGeometry(result, field),
    [field, result],
  )
  const captionId = useId()
  const fieldId = useId()

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (context) {
      drawPandaThermalFem(context, fieldGeometry, {
        zoom,
        panX: pan.x,
        panY: pan.y,
        showMeshEdges,
      })
    }
  }, [fieldGeometry, pan, showMeshEdges, zoom])

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
      Math.min(THERMAL_FEM_CANVAS_WIDTH, THERMAL_FEM_CANVAS_HEIGHT) /
      (2 * fieldGeometry.claddingRadiusM * 1.08)
    const modelX =
      (point.x - THERMAL_FEM_CANVAS_WIDTH / 2 - pan.x) / (scale * zoom)
    const modelY =
      (THERMAL_FEM_CANVAS_HEIGHT / 2 + pan.y - point.y) / (scale * zoom)
    setPan({
      x: point.x - THERMAL_FEM_CANVAS_WIDTH / 2 - modelX * scale * clampedZoom,
      y: point.y - THERMAL_FEM_CANVAS_HEIGHT / 2 + modelY * scale * clampedZoom,
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
      THERMAL_FEM_CANVAS_WIDTH / (bounds.width || THERMAL_FEM_CANVAS_WIDTH)
    const verticalScale =
      THERMAL_FEM_CANVAS_HEIGHT / (bounds.height || THERMAL_FEM_CANVAS_HEIGHT)
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
    updateZoomAtPoint(zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2), point)
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

  const scale = fieldGeometry.scale
  const scaleText =
    scale.kind === 'region'
      ? 'Categorical region colours'
      : `${formatScale(scale.minimum)} to ${formatScale(scale.maximum)} ${scale.unit}`

  return (
    <figure className="panda-mesh-figure" aria-labelledby={captionId}>
      <div className="panda-mesh-plot-heading">
        <div>
          <p className="panda-mesh-eyebrow">
            Step 2.6 · quantitative FEM field
          </p>
          <h3>{fieldGeometry.definition.label}</h3>
        </div>
        <span>{fieldGeometry.definition.unit}</span>
      </div>
      <div className="panda-mesh-facts">
        <span>
          <strong>Scale</strong> {scaleText}
        </span>
        <span>
          <strong>Conversion</strong> {fieldGeometry.definition.conversion}
        </span>
        <span>
          <strong>Elements</strong>{' '}
          {fieldGeometry.elementCount.toLocaleString()}
        </span>
      </div>
      <div
        className="panda-mesh-controls"
        aria-label="Thermal FEM field controls"
      >
        <label htmlFor={fieldId}>Quantity</label>
        <select
          id={fieldId}
          aria-label="FEM quantity"
          value={field}
          onChange={(event) => setField(event.target.value as ThermalFemField)}
        >
          {THERMAL_FEM_FIELD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={showMeshEdges}
            onChange={(event) => setShowMeshEdges(event.target.checked)}
          />{' '}
          Thin mesh edges
        </label>
      </div>
      <div className="panda-mesh-canvas-frame">
        <canvas
          ref={canvasRef}
          width={THERMAL_FEM_CANVAS_WIDTH}
          height={THERMAL_FEM_CANVAS_HEIGHT}
          tabIndex={0}
          role="img"
          aria-label={`${fieldGeometry.definition.label}, quantitative mechanical FEM field`}
          aria-describedby={captionId}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerDrag}
          onPointerCancel={finishPointerDrag}
          onWheel={handleWheel}
        />
      </div>
      <div className="panda-mesh-controls" aria-label="FEM view controls">
        <button
          type="button"
          aria-label="Zoom out FEM field"
          onClick={() => updateZoomAtPoint(zoom / 1.2)}
        >
          −
        </button>
        <label htmlFor={`${fieldId}-zoom`}>Zoom</label>
        <input
          id={`${fieldId}-zoom`}
          type="range"
          min={THERMAL_FEM_ZOOM_MIN}
          max={THERMAL_FEM_ZOOM_MAX}
          step={THERMAL_FEM_ZOOM_STEP}
          value={zoom}
          onChange={(event) => updateZoomAtPoint(Number(event.target.value))}
          aria-valuetext={`${Math.round(zoom * 100)} percent`}
        />
        <output htmlFor={`${fieldId}-zoom`}>{Math.round(zoom * 100)}%</output>
        <button
          type="button"
          aria-label="Zoom in FEM field"
          onClick={() => updateZoomAtPoint(zoom * 1.2)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Reset FEM field view"
          onClick={resetView}
        >
          Reset
        </button>
      </div>
      <p className="panda-mesh-control-help">
        Drag to pan. Use the wheel, buttons, or keyboard: +/− zoom, 0 reset, and
        arrow keys pan.
      </p>
      <ul className="panda-mesh-legend" aria-label="Thermal FEM colour scale">
        <li>{scaleText}</li>
        <li>21 retained bins for numeric fields</li>
        <li>{fieldGeometry.interfaceEdgeCount.toLocaleString()} interfaces</li>
      </ul>
      <figcaption id={captionId}>
        Quantitative mechanical FEM result over the returned triangular mesh.
        Numeric stress values are displayed in MPa from Pa × 1e−6, displacement
        in µm from m × 1e6, and strain is dimensionless. This renderer shows
        mechanical fields only; it does not calculate or claim birefringence.
      </figcaption>
    </figure>
  )
}
