import type { MacrobendInput } from './Level1Form'
import { CurvePath, LineCurve3, Vector3 } from 'three'
import type { FibrePath } from './fibreShowcase'
import { getFibrePathFrame } from './fibreShowcase'
import type { MacrobendLossResult } from './macrobend'

export type EducationalRayPoint = {
  t: number
  position: [number, number, number]
}

export type EducationalRayChunk = {
  points: EducationalRayPoint[]
  cumulativeLossDb: number
  outputPowerDbm: number | null
}

export type EducationalTransmissionPath = {
  incident: EducationalRayPoint[]
  exiting: EducationalRayPoint[]
  leakagePoint: EducationalRayPoint
  leakageMarkers: EducationalRayPoint[]
}

export type EducationalRayTubeGeometry = {
  args: [CurvePath<Vector3>, number, number, number, false]
}

type RayLossState = {
  cumulativeLossDb: number
  outputPowerDbm: number | null
}

const tubeGeometryCache = new WeakMap<
  EducationalRayPoint[],
  Map<number, EducationalRayTubeGeometry | null>
>()

export function getEducationalRayTubeGeometry(
  points: EducationalRayPoint[],
  thickness: number,
): EducationalRayTubeGeometry | null {
  let thicknessCache = tubeGeometryCache.get(points)
  if (thicknessCache === undefined) {
    thicknessCache = new Map()
    tubeGeometryCache.set(points, thicknessCache)
  }

  const cached = thicknessCache.get(thickness)
  if (cached !== undefined) {
    return cached
  }

  const curve = new CurvePath<Vector3>()
  for (let index = 1; index < points.length; index += 1) {
    curve.add(
      new LineCurve3(
        new Vector3(...points[index - 1].position),
        new Vector3(...points[index].position),
      ),
    )
  }

  const geometry: EducationalRayTubeGeometry | null =
    curve.curves.length === 0
      ? null
      : {
          args: [
            curve,
            Math.max(8, (points.length - 1) * 2),
            thickness,
            6,
            false,
          ],
        }
  thicknessCache.set(thickness, geometry)
  return geometry
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((value) => value.toFixed(9)))]
    .map(Number)
    .sort((left, right) => left - right)
}

function getSampleTs(
  path: FibrePath,
  startT: number,
  endT: number,
  extras: readonly number[] = [],
): number[] {
  const pathLength = path.curve.getLength()
  const count = clamp(Math.ceil(pathLength * 10) + 1, 49, 129)
  const values = Array.from(
    { length: count },
    (_, index) => startT + ((endT - startT) * index) / (count - 1),
  )

  for (const value of extras) {
    if (value > startT && value < endT) {
      values.push(value)
    }
  }

  return uniqueSorted(values)
}

function offsetPoint(
  path: FibrePath,
  t: number,
  normalOffset: number,
  binormalOffset = 0,
): EducationalRayPoint {
  const frame = getFibrePathFrame(path, t)

  return {
    t,
    position: [
      frame.position[0] +
        frame.normal[0] * normalOffset +
        frame.binormal[0] * binormalOffset,
      frame.position[1] +
        frame.normal[1] * normalOffset +
        frame.binormal[1] * binormalOffset,
      frame.position[2] +
        frame.normal[2] * normalOffset +
        frame.binormal[2] * binormalOffset,
    ],
  }
}

function getLossState(
  t: number,
  bendLoss: MacrobendLossResult | null | undefined,
): RayLossState {
  if (bendLoss !== null && bendLoss !== undefined) {
    let state: RayLossState = {
      cumulativeLossDb: 0,
      outputPowerDbm: bendLoss.input_power_dbm,
    }

    for (const bend of bendLoss.bends) {
      if (bend.position_fraction > t + 1e-9) {
        break
      }
      state = {
        cumulativeLossDb: bend.cumulative_bend_loss_db,
        outputPowerDbm: bend.output_power_dbm,
      }
    }

    return state
  }

  return { cumulativeLossDb: 0, outputPowerDbm: null }
}

function splitAtLossChanges(
  points: EducationalRayPoint[],
  bendLoss: MacrobendLossResult | null | undefined,
): EducationalRayChunk[] {
  const chunks: EducationalRayChunk[] = []

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const state = getLossState((start.t + end.t) / 2, bendLoss)
    const previous = chunks[chunks.length - 1]

    if (
      previous !== undefined &&
      previous.cumulativeLossDb === state.cumulativeLossDb &&
      previous.outputPowerDbm === state.outputPowerDbm
    ) {
      previous.points.push(end)
    } else {
      chunks.push({ points: [start, end], ...state })
    }
  }

  return chunks
}

export function buildReflectedRayPath(
  path: FibrePath,
  coreRadius: number,
  raySlope: number,
  macrobends: readonly MacrobendInput[] | null | undefined,
  bendLoss: MacrobendLossResult | null | undefined,
): EducationalRayChunk[] {
  const pathLength = path.curve.getLength()
  const marginT = pathLength > 0 ? clamp(0.25 / pathLength, 0, 0.2) : 0
  const startT = marginT
  const endT = 1 - marginT
  const edge = coreRadius * 0.82
  const traverseDistance = (2 * edge) / raySlope
  const extras = (macrobends ?? []).map((bend) => bend.position_fraction)

  if (traverseDistance > 0) {
    for (
      let distance = traverseDistance;
      distance < (endT - startT) * pathLength;
      distance += traverseDistance
    ) {
      extras.push(startT + distance / pathLength)
    }
  }

  const points = getSampleTs(path, startT, endT, extras).map((t) => {
    const distance = (t - startT) * pathLength
    const phase = traverseDistance > 0 ? distance / traverseDistance : 0
    const traverseIndex = Math.floor(phase)
    const fraction = phase - traverseIndex
    const offset =
      traverseIndex % 2 === 0
        ? -edge + 2 * edge * fraction
        : edge - 2 * edge * fraction

    return offsetPoint(path, t, offset)
  })

  return splitAtLossChanges(points, bendLoss)
}

export function buildCriticalRayPath(
  path: FibrePath,
  coreRadius: number,
): EducationalRayPoint[] {
  const pathLength = path.curve.getLength()
  const marginT = pathLength > 0 ? clamp(0.25 / pathLength, 0, 0.2) : 0

  return getSampleTs(path, marginT, 1 - marginT).map((t) =>
    offsetPoint(path, t, coreRadius * 0.98),
  )
}

export function buildTransmittedRayPath(
  path: FibrePath,
  coreRadius: number,
  claddingRadius: number,
  markerCount: number,
): EducationalTransmissionPath {
  const pathLength = path.curve.getLength()
  const marginT = pathLength > 0 ? clamp(0.25 / pathLength, 0, 0.2) : 0
  const startT = marginT
  const endT = 1 - marginT
  const leakageT = 0.5
  const boundaryOffset = coreRadius * 0.98
  const outputOffset = Math.max(coreRadius * 1.08, claddingRadius * 0.72)
  const incident = getSampleTs(path, startT, leakageT).map((t) => {
    const progress = (t - startT) / Math.max(1e-9, leakageT - startT)
    const offset =
      -coreRadius * 0.55 + (boundaryOffset + coreRadius * 0.55) * progress
    return offsetPoint(path, t, offset)
  })
  const exiting = getSampleTs(path, leakageT, endT).map((t) => {
    const progress = (t - leakageT) / Math.max(1e-9, endT - leakageT)
    return offsetPoint(
      path,
      t,
      boundaryOffset + (outputOffset - boundaryOffset) * progress,
    )
  })
  const safeMarkerCount = Math.max(2, Math.floor(markerCount))
  const leakageMarkers = Array.from({ length: safeMarkerCount }, (_, index) => {
    const progress = index / (safeMarkerCount - 1)
    const t = leakageT + (endT - leakageT) * progress
    const normalOffset =
      boundaryOffset + (outputOffset - boundaryOffset) * progress
    const flare = progress * 0.14 * (index % 2 === 0 ? 1 : -0.35)
    return offsetPoint(path, t, normalOffset, flare)
  })

  return {
    incident,
    exiting,
    leakagePoint: offsetPoint(path, leakageT, boundaryOffset),
    leakageMarkers,
  }
}
