import { contours, type ContourMultiPolygon } from 'd3-contour'

import type {
  PandaFieldPresentationMode,
  PandaFieldResult,
} from './pandaFieldModel'

export const FIGURE_FIELD_LABEL = 'Signed normalized deviatoric difference'

export const FILLED_CONTOUR_THRESHOLDS = Array.from(
  { length: 21 },
  (_, index) => -1 + index / 10,
)
export const ISOLINE_THRESHOLDS = Array.from(
  { length: 17 },
  (_, index) => -1 + index / 8,
)

const PLOT_LEFT = 68
const PLOT_TOP = 34
const PLOT_SIZE = 610

type NullableGrid = ReadonlyArray<ReadonlyArray<number | null>>
type CanvasPoint = readonly [number, number]

export type PandaFieldContourGeometries = {
  filled: readonly ContourMultiPolygon[]
  isolines: readonly ContourMultiPolygon[]
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

function contourValues(result: PandaFieldResult, grid: NullableGrid) {
  const values: number[] = []
  for (let row = 0; row < result.y_coordinates_m.length; row += 1) {
    for (let column = 0; column < result.x_coordinates_m.length; column += 1) {
      const value = grid[row]?.[column]
      values.push(
        result.validity_mask[row]?.[column] && value !== null
          ? Math.max(-1, Math.min(1, value))
          : Number.NaN,
      )
    }
  }
  return values
}

export function buildPandaFieldContourGeometries(
  result: PandaFieldResult,
): PandaFieldContourGeometries {
  const values = contourValues(
    result,
    result.normalized_deviatoric_difference_kernel as NullableGrid,
  )
  const size: [number, number] = [
    result.x_coordinates_m.length,
    result.y_coordinates_m.length,
  ]
  const filledGenerator = contours()
    .size(size)
    .smooth(true)
    .thresholds(FILLED_CONTOUR_THRESHOLDS)
  const isolineGenerator = contours()
    .size(size)
    .smooth(true)
    .thresholds(ISOLINE_THRESHOLDS)

  return {
    filled: filledGenerator(values),
    isolines: isolineGenerator(values),
  }
}

function coordinateAtGridPosition(
  coordinates: readonly number[],
  gridPosition: number,
) {
  if (coordinates.length === 0) {
    return 0
  }
  if (coordinates.length === 1) {
    return coordinates[0]
  }

  const samplePosition = Math.max(
    0,
    Math.min(coordinates.length - 1, gridPosition - 0.5),
  )
  const lower = Math.floor(samplePosition)
  const upper = Math.min(coordinates.length - 1, lower + 1)
  const fraction = samplePosition - lower
  return (
    coordinates[lower] + (coordinates[upper] - coordinates[lower]) * fraction
  )
}

function contourPointToCanvas(
  point: CanvasPoint,
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
): CanvasPoint {
  return [
    toX(coordinateAtGridPosition(result.x_coordinates_m, point[0])),
    toY(coordinateAtGridPosition(result.y_coordinates_m, point[1])),
  ]
}

function drawContourGeometry(
  context: CanvasRenderingContext2D,
  geometry: ContourMultiPolygon,
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
  operation: 'fill' | 'stroke',
) {
  for (const polygon of geometry.coordinates) {
    context.beginPath()
    for (const ring of polygon) {
      ring.forEach((point, index) => {
        const [x, y] = contourPointToCanvas(
          point as unknown as CanvasPoint,
          result,
          toX,
          toY,
        )
        if (index === 0) {
          context.moveTo(x, y)
        } else {
          context.lineTo(x, y)
        }
      })
      context.closePath()
    }
    if (operation === 'fill') {
      context.fill('evenodd')
    } else {
      context.stroke()
    }
  }
}

export function drawFilledContours(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
  filled: readonly ContourMultiPolygon[],
) {
  for (const contour of filled) {
    context.fillStyle = fieldColor(contour.value)
    drawContourGeometry(context, contour, result, toX, toY, 'fill')
  }
}

export function drawIsolines(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
  isolines: readonly ContourMultiPolygon[],
) {
  context.lineWidth = 1
  for (const contour of isolines) {
    context.strokeStyle =
      contour.value === 0 ? 'rgb(20 28 38 / 85%)' : 'rgb(20 28 38 / 52%)'
    context.lineWidth = contour.value === 0 ? 1.8 : 1
    drawContourGeometry(context, contour, result, toX, toY, 'stroke')
  }
}

function addPlotRectangle(context: CanvasRenderingContext2D) {
  context.moveTo(PLOT_LEFT, PLOT_TOP)
  context.lineTo(PLOT_LEFT + PLOT_SIZE, PLOT_TOP)
  context.lineTo(PLOT_LEFT + PLOT_SIZE, PLOT_TOP + PLOT_SIZE)
  context.lineTo(PLOT_LEFT, PLOT_TOP + PLOT_SIZE)
  context.closePath()
}

function addCirclePath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  toX: (value: number) => number,
  toY: (value: number) => number,
) {
  context.moveTo(toX(x + radius), toY(y))
  context.arc(
    toX(x),
    toY(y),
    Math.abs(toX(x + radius) - toX(x)),
    0,
    Math.PI * 2,
  )
}

function addSapPaths(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
) {
  const buffer = result.configuration.sampling.interface_buffer_m
  for (const sap of [
    result.configuration.geometry.sap_1,
    result.configuration.geometry.sap_2,
  ]) {
    addCirclePath(
      context,
      sap.center_x_m,
      sap.center_y_m,
      sap.radius_m + buffer,
      toX,
      toY,
    )
  }
}

function drawHatch(
  context: CanvasRenderingContext2D,
  spacing: number,
  strokeStyle: string,
) {
  context.beginPath()
  for (let offset = -PLOT_SIZE; offset <= PLOT_SIZE * 2; offset += spacing) {
    context.moveTo(PLOT_LEFT + offset, PLOT_TOP + PLOT_SIZE)
    context.lineTo(PLOT_LEFT + offset + PLOT_SIZE, PLOT_TOP)
  }
  context.strokeStyle = strokeStyle
  context.lineWidth = 0.8
  context.stroke()
}

export function drawInvalidMaskOverlay(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
  presentationMode: PandaFieldPresentationMode,
) {
  const cladding = result.configuration.geometry.cladding_radius_m

  context.save()
  context.beginPath()
  addPlotRectangle(context)
  addCirclePath(context, 0, 0, cladding, toX, toY)
  context.fillStyle = 'rgb(8 16 25 / 50%)'
  context.fill('evenodd')
  context.restore()

  context.save()
  context.beginPath()
  addPlotRectangle(context)
  addCirclePath(context, 0, 0, cladding, toX, toY)
  context.clip('evenodd')
  drawHatch(context, 24, 'rgb(216 226 236 / 40%)')
  context.restore()

  context.beginPath()
  addSapPaths(context, result, toX, toY)
  context.fillStyle =
    presentationMode === 'reference_replica'
      ? 'rgb(213 220 228 / 90%)'
      : 'rgb(63 76 91 / 82%)'
  context.fill()

  if (presentationMode !== 'reference_replica') {
    context.save()
    context.beginPath()
    addSapPaths(context, result, toX, toY)
    context.clip()
    drawHatch(context, 20, 'rgb(216 226 236 / 48%)')
    context.restore()
  }
}
