import { useEffect, useId, useRef } from 'react'

import type { PandaFieldDisplay, PandaFieldResult } from './pandaFieldModel'
import { corePrincipalAxisAngle } from './pandaFieldView'

const CANVAS_SIZE = 720
const PLOT_LEFT = 68
const PLOT_TOP = 34
const PLOT_SIZE = 610

const displayDefinitions = {
  deviatoric: {
    label: 'Deviatoric difference',
    field: 'normalized_deviatoric_difference_kernel',
  },
  shear: {
    label: 'Shear',
    field: 'normalized_shear_kernel',
  },
  principal: {
    label: 'Principal difference',
    field: 'normalized_principal_difference_kernel',
  },
} as const

type DisplayKey = keyof typeof displayDefinitions
type NullableGrid = ReadonlyArray<ReadonlyArray<number | null>>

function displayDefinition(display: PandaFieldDisplay) {
  return (
    displayDefinitions[String(display) as DisplayKey] ??
    displayDefinitions.deviatoric
  )
}

function fieldColor(value: number) {
  const normalized = Math.max(-1, Math.min(1, value))
  const neutral = [226, 231, 237]
  const endpoint = normalized < 0 ? [36, 99, 235] : [220, 48, 48]
  const amount = Math.abs(normalized)
  const channels = neutral.map((channel, index) =>
    Math.round(channel + (endpoint[index] - channel) * amount),
  )
  return `rgb(${channels.join(' ')})`
}

function drawMaskCell(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.fillStyle = '#101720'
  context.fillRect(x, y, width, height)
  context.beginPath()
  context.moveTo(x, y + height)
  context.lineTo(x + width, y)
  context.strokeStyle = '#273443'
  context.lineWidth = 1
  context.stroke()
}

function drawGrid(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  grid: NullableGrid,
) {
  const rows = result.y_coordinates_m.length
  const columns = result.x_coordinates_m.length
  const cellWidth = PLOT_SIZE / columns
  const cellHeight = PLOT_SIZE / rows

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = PLOT_LEFT + column * cellWidth
      const y = PLOT_TOP + (rows - row - 1) * cellHeight
      const value = grid[row]?.[column] ?? null
      if (!result.validity_mask[row]?.[column] || value === null) {
        drawMaskCell(context, x, y, cellWidth + 0.5, cellHeight + 0.5)
      } else {
        context.fillStyle = fieldColor(value)
        context.fillRect(x, y, cellWidth + 0.5, cellHeight + 0.5)
      }
    }
  }
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
  display: PandaFieldDisplay,
) {
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  context.fillStyle = '#0b1118'
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

  const definition = displayDefinition(display)
  const grid = result[definition.field] as NullableGrid
  drawGrid(context, result, grid)

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
  drawAxes(context, toX, toY)
  drawGeometry(context, result, toX, toY, radiusScale)
  drawCoreAxis(
    context,
    result,
    corePrincipalAxisAngle(result),
    toX,
    toY,
    radiusScale,
  )
}

export type PandaFieldCanvasProps = {
  result: PandaFieldResult
  display: PandaFieldDisplay
}

export function PandaFieldCanvas({ result, display }: PandaFieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const captionId = useId()
  const axisId = useId()
  const definition = displayDefinition(display)
  const axisAngle = corePrincipalAxisAngle(result)
  const xMinimumUm = result.x_coordinates_m[0] * 1e6
  const xMaximumUm = result.x_coordinates_m.at(-1)! * 1e6
  const yMinimumUm = result.y_coordinates_m[0] * 1e6
  const yMaximumUm = result.y_coordinates_m.at(-1)! * 1e6

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (context) {
      drawField(context, result, display)
    }
  }, [display, result])

  return (
    <figure className="panda-field-figure" aria-labelledby={captionId}>
      <div className="panda-field-plot-heading">
        <div>
          <p className="panda-field-eyebrow">Selected normalized field</p>
          <h3>{definition.label}</h3>
        </div>
        <span>dimensionless</span>
      </div>
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
          aria-label={`${definition.label} normalized qualitative PANDA field map`}
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
        Figure 5.1 — {definition.label.toLowerCase()} from the backend
        normalized qualitative far-field kernel. The fixed colour range is −1 to
        +1; principal-difference values occupy 0 to +1. Dark hatched cells are
        outside the valid region, inside a SAP, or within its interface mask.
        Values are normalized by the maximum valid principal-difference kernel
        magnitude and are not stress in pascals.
      </figcaption>
    </figure>
  )
}
