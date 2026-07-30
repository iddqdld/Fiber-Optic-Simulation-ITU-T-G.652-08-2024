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

type NullableGrid = ReadonlyArray<ReadonlyArray<number | null>>
type CanvasPoint = readonly [number, number]

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
) {
  const grid = result.normalized_deviatoric_difference_kernel as NullableGrid
  const contourGenerator = contours()
    .size([result.x_coordinates_m.length, result.y_coordinates_m.length])
    .smooth(true)
    .thresholds(FILLED_CONTOUR_THRESHOLDS)

  for (const contour of contourGenerator(contourValues(result, grid))) {
    context.fillStyle = fieldColor(contour.value)
    drawContourGeometry(context, contour, result, toX, toY, 'fill')
  }
}

export function drawIsolines(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
) {
  const grid = result.normalized_deviatoric_difference_kernel as NullableGrid
  const contourGenerator = contours()
    .size([result.x_coordinates_m.length, result.y_coordinates_m.length])
    .smooth(true)
    .thresholds(ISOLINE_THRESHOLDS)

  context.lineWidth = 1
  for (const contour of contourGenerator(contourValues(result, grid))) {
    context.strokeStyle =
      contour.value === 0 ? 'rgb(20 28 38 / 85%)' : 'rgb(20 28 38 / 52%)'
    context.lineWidth = contour.value === 0 ? 1.8 : 1
    drawContourGeometry(context, contour, result, toX, toY, 'stroke')
  }
}

type MaskRegion = {
  left: number
  right: number
  top: number
  bottom: number
  sapInterior: boolean
}

function coordinateCellEdges(coordinates: readonly number[], index: number) {
  const current = coordinates[index]
  const lower = index === 0 ? current : (coordinates[index - 1] + current) / 2
  const upper =
    index === coordinates.length - 1
      ? current
      : (current + coordinates[index + 1]) / 2
  return [lower, upper] as const
}

function isSapInterior(result: PandaFieldResult, x: number, y: number) {
  return [
    result.configuration.geometry.sap_1,
    result.configuration.geometry.sap_2,
  ].some(
    (sap) => Math.hypot(x - sap.center_x_m, y - sap.center_y_m) <= sap.radius_m,
  )
}

function maskRegions(
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
) {
  const regions: MaskRegion[] = []
  for (let row = 0; row < result.y_coordinates_m.length; row += 1) {
    for (let column = 0; column < result.x_coordinates_m.length; column += 1) {
      if (result.validity_mask[row]?.[column]) {
        continue
      }
      const [x0, x1] = coordinateCellEdges(result.x_coordinates_m, column)
      const [y0, y1] = coordinateCellEdges(result.y_coordinates_m, row)
      regions.push({
        left: Math.min(toX(x0), toX(x1)),
        right: Math.max(toX(x0), toX(x1)),
        top: Math.min(toY(y0), toY(y1)),
        bottom: Math.max(toY(y0), toY(y1)),
        sapInterior: isSapInterior(
          result,
          result.x_coordinates_m[column],
          result.y_coordinates_m[row],
        ),
      })
    }
  }
  return regions
}

function addRectanglePath(
  context: CanvasRenderingContext2D,
  region: MaskRegion,
) {
  context.moveTo(region.left, region.top)
  context.lineTo(region.right, region.top)
  context.lineTo(region.right, region.bottom)
  context.lineTo(region.left, region.bottom)
  context.closePath()
}

export function drawInvalidMaskOverlay(
  context: CanvasRenderingContext2D,
  result: PandaFieldResult,
  toX: (value: number) => number,
  toY: (value: number) => number,
  presentationMode: PandaFieldPresentationMode,
) {
  const regions = maskRegions(result, toX, toY)
  if (regions.length === 0) {
    return
  }

  const sapRegions = regions.filter((region) => region.sapInterior)
  const otherRegions = regions.filter((region) => !region.sapInterior)
  if (otherRegions.length > 0) {
    context.beginPath()
    for (const region of otherRegions) {
      addRectanglePath(context, region)
    }
    context.fillStyle = 'rgb(8 16 25 / 42%)'
    context.fill('evenodd')
  }
  if (sapRegions.length > 0) {
    context.beginPath()
    for (const region of sapRegions) {
      addRectanglePath(context, region)
    }
    context.fillStyle =
      presentationMode === 'reference_replica'
        ? 'rgb(213 220 228 / 68%)'
        : 'rgb(8 16 25 / 42%)'
    context.fill('evenodd')
  }

  context.beginPath()
  context.strokeStyle = 'rgb(216 226 236 / 68%)'
  context.lineWidth = 0.8
  for (const region of regions) {
    context.moveTo(region.left, region.bottom)
    context.lineTo(region.right, region.top)
  }
  context.stroke()
}
