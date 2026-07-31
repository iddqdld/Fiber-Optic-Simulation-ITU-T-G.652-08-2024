import { useEffect, useId, useMemo, useRef } from 'react'

import type {
  PandaFieldPresentationMode,
  PandaFieldResult,
} from './pandaFieldModel'
import {
  buildPandaFieldContourGeometries,
  drawFilledContours,
  drawInvalidMaskOverlay,
  drawIsolines,
  FIGURE_FIELD_LABEL,
} from './pandaFieldContours'
import type { PandaFieldContourGeometries } from './pandaFieldContours'

const CANVAS_SIZE = 720
const PLOT_LEFT = 68
const PLOT_TOP = 34
const PLOT_SIZE = 610

function drawReferenceSpokes(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
) {
  const geometry = result.configuration.geometry
  const centerX = toX(geometry.core_center_x_m)
  const centerY = toY(geometry.core_center_y_m)
  context.beginPath()
  context.strokeStyle = 'rgb(240 248 255 / 34%)'
  context.lineWidth = 0.8
  for (let index = 0; index < 16; index += 1) {
    const angle = (index * Math.PI) / 8
    context.moveTo(centerX, centerY)
    context.lineTo(
      toX(
        geometry.core_center_x_m + Math.cos(angle) * geometry.cladding_radius_m,
      ),
      toY(
        geometry.core_center_y_m + Math.sin(angle) * geometry.cladding_radius_m,
      ),
    )
  }
  context.stroke()
}

function drawGeometry(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
  radiusScale: number,
) {
  const geometry = result.configuration.geometry
  const circles = [
    {
      x: 0,
      y: 0,
      radius: geometry.cladding_radius_m,
      color: '#d8e3ef',
      width: 2.5,
    },
    {
      x: geometry.core_center_x_m,
      y: geometry.core_center_y_m,
      radius: geometry.core_radius_m,
      color: '#f8fafc',
      width: 2,
    },
    {
      x: geometry.sap_1.center_x_m,
      y: geometry.sap_1.center_y_m,
      radius: geometry.sap_1.radius_m,
      color: '#fbbf24',
      width: 2,
    },
    {
      x: geometry.sap_2.center_x_m,
      y: geometry.sap_2.center_y_m,
      radius: geometry.sap_2.radius_m,
      color: '#fbbf24',
      width: 2,
    },
  ]

  for (const circle of circles) {
    context.beginPath()
    context.arc(
      toX(circle.x),
      toY(circle.y),
      circle.radius * radiusScale,
      0,
      Math.PI * 2,
    )
    context.strokeStyle = circle.color
    context.lineWidth = circle.width
    context.stroke()
  }
}

function drawAxes(
  context: CanvasRenderingContext2D,
  toX: (value: number) => number,
  toY: (value: number) => number,
) {
  context.beginPath()
  context.moveTo(PLOT_LEFT, toY(0))
  context.lineTo(PLOT_LEFT + PLOT_SIZE, toY(0))
  context.moveTo(toX(0), PLOT_TOP)
  context.lineTo(toX(0), PLOT_TOP + PLOT_SIZE)
  context.strokeStyle = 'rgb(255 255 255 / 45%)'
  context.lineWidth = 1
  context.stroke()
  context.fillStyle = '#e7edf4'
  context.font = '15px system-ui, sans-serif'
  context.fillText('x (µm)', PLOT_LEFT + PLOT_SIZE - 43, toY(0) - 8)
  context.fillText('y (µm)', toX(0) + 8, PLOT_TOP + 17)
}

function drawCoreAxis(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  angle: number | null,
  toX: (value: number) => number,
  toY: (value: number) => number,
  radiusScale: number,
) {
  if (angle === null) {
    return
  }
  const geometry = result.configuration.geometry
  const halfLength = Math.max(geometry.core_radius_m * radiusScale * 1.8, 16)
  const dx = Math.cos(angle) * halfLength
  const dy = Math.sin(angle) * halfLength
  const centerX = toX(geometry.core_center_x_m)
  const centerY = toY(geometry.core_center_y_m)
  context.beginPath()
  context.moveTo(centerX - dx, centerY + dy)
  context.lineTo(centerX + dx, centerY - dy)
  context.strokeStyle = '#22d3ee'
  context.lineWidth = 3
  context.stroke()
}

function drawField(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  presentationMode: PandaFieldPresentationMode,
  showReferenceSpokes: boolean,
  contourGeometries: PandaFieldContourGeometries,
) {
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  context.fillStyle = '#0b1118'
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

  const minimumX = result.x_coordinates_m[0]
  const maximumX = result.x_coordinates_m.at(-1)
  const minimumY = result.y_coordinates_m[0]
  const maximumY = result.y_coordinates_m.at(-1)
  if (
    minimumX === undefined ||
    maximumX === undefined ||
    minimumY === undefined ||
    maximumY === undefined ||
    maximumX === minimumX ||
    maximumY === minimumY
  ) {
    return
  }

  const toX = (value: number) =>
    PLOT_LEFT + ((value - minimumX) / (maximumX - minimumX)) * PLOT_SIZE
  const toY = (value: number) =>
    PLOT_TOP + ((maximumY - value) / (maximumY - minimumY)) * PLOT_SIZE
  const radiusScale = PLOT_SIZE / (maximumX - minimumX)

  drawFilledContours(context, result, toX, toY, contourGeometries.filled)
  drawIsolines(context, result, toX, toY, contourGeometries.isolines)
  drawInvalidMaskOverlay(context, result, toX, toY, presentationMode)
  if (presentationMode === 'reference_replica' && showReferenceSpokes) {
    drawReferenceSpokes(context, result, toX, toY)
  }
  drawAxes(context, toX, toY)
  drawGeometry(context, result, toX, toY, radiusScale)
  drawCoreAxis(
    context,
    result,
    result.core_principal_axis_angle_rad,
    toX,
    toY,
    radiusScale,
  )
}

export type PandaFieldCanvasProps = {
  result: PandaFieldResult
  presentationMode?: PandaFieldPresentationMode
  showReferenceSpokes?: boolean
}

export function PandaFieldCanvas({
  result,
  presentationMode = 'validity_aware',
  showReferenceSpokes = false,
}: PandaFieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const captionId = useId()
  const axisId = useId()
  const axisAngle = result.core_principal_axis_angle_rad
  const xMinimumUm = result.x_coordinates_m[0] * 1e6
  const xMaximumUm = result.x_coordinates_m.at(-1)! * 1e6
  const yMinimumUm = result.y_coordinates_m[0] * 1e6
  const yMaximumUm = result.y_coordinates_m.at(-1)! * 1e6
  const isReferenceReplica = presentationMode === 'reference_replica'
  const contourGeometries = useMemo(
    () => buildPandaFieldContourGeometries(result),
    [result],
  )

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (context) {
      drawField(
        context,
        result,
        presentationMode,
        showReferenceSpokes,
        contourGeometries,
      )
    }
  }, [contourGeometries, presentationMode, result, showReferenceSpokes])

  return (
    <figure className="panda-field-figure" aria-labelledby={captionId}>
      <div className="panda-field-plot-heading">
        <div>
          <p className="panda-field-eyebrow">Figure 5.1 · fixed quantity</p>
          <h3>{FIGURE_FIELD_LABEL}</h3>
        </div>
        <span>
          dimensionless{isReferenceReplica ? ' · comparison-only' : ''}
        </span>
      </div>
      {isReferenceReplica && (
        <p className="panda-field-mode-label">
          Reference replica (comparison-only): zero applied interface buffer;
          SAP interiors are neutral.
        </p>
      )}
      <p className="panda-field-extent">
        Physical extent: x {xMinimumUm.toFixed(2)} to {xMaximumUm.toFixed(2)}
        {' µm'}; y {yMinimumUm.toFixed(2)} to {yMaximumUm.toFixed(2)} µm.
      </p>
      <div className="panda-field-canvas-frame">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          role="img"
          aria-label={`${FIGURE_FIELD_LABEL} qualitative PANDA field map`}
          aria-describedby={`${captionId} ${axisId}`}
        />
      </div>
      <div
        className="panda-field-scale"
        aria-label="Fixed colour scale from -1 to +1"
      >
        <div className="panda-field-scale-labels">
          <span>−1</span>
          <span>0</span>
          <span>+1</span>
        </div>
        <span aria-hidden="true" className="panda-field-scale-bar" />
      </div>
      <p id={axisId} className="panda-field-axis-text">
        {axisAngle === null
          ? 'Core-centre principal axis is undefined for the nearest valid backend sample.'
          : `Core-centre principal axis: ${((axisAngle * 180) / Math.PI).toFixed(2)}° from the positive x-axis.`}
      </p>
      <figcaption id={captionId}>
        Figure 5.1 — signed normalized deviatoric-difference kernel from the
        backend. Filled contours use about 21 levels and thin isolines use 17
        fixed thresholds including zero. The fixed colour range is −1 to +1;
        values are dimensionless. Invalid samples use the backend validity mask
        as a separate semi-transparent hatched overlay.{' '}
        {isReferenceReplica
          ? 'This reference replica is comparison-only and applies zero interface buffer so contours reach SAP boundaries; SAP interiors remain neutral.'
          : 'Validity-aware mode applies the configured interface buffer and shows the explicit invalid-region mask.'}
      </figcaption>
    </figure>
  )
}
