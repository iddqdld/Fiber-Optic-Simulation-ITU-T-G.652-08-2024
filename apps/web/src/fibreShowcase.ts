import { CatmullRomCurve3, Curve, Quaternion, Vector3 } from 'three'

import type { MacrobendInput } from './Level1Form'
import type { MacrobendLossResult } from './macrobend'
import type { PowerDistanceData } from './powerDistancePlot'
import type { PulseAnimationData } from './pulseAnimation'

export type FibreRouteStyle = 'straight' | 'gentle_arc' | 's_bend'

export type CameraPresetId = 'perspective' | 'side' | 'end_on' | 'top'

export const FIBRE_ROUTE_OPTIONS: ReadonlyArray<{
  id: FibreRouteStyle
  label: string
}> = [
  { id: 'straight', label: 'Straight' },
  { id: 'gentle_arc', label: 'Gentle arc' },
  { id: 's_bend', label: 'S-bend' },
]

export const CAMERA_PRESET_OPTIONS: ReadonlyArray<{
  id: CameraPresetId
  label: string
}> = [
  { id: 'perspective', label: 'Perspective' },
  { id: 'side', label: 'Side' },
  { id: 'end_on', label: 'End-on' },
  { id: 'top', label: 'Top' },
]

export const CAMERA_PRESETS: Record<
  CameraPresetId,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  perspective: { position: [10, 6, 12], target: [0, 0, 0] },
  side: { position: [0, 0, 16], target: [0, 0, 0] },
  end_on: { position: [18, 1.5, 0], target: [0, 0, 0] },
  top: { position: [0, 18, 0.01], target: [0, 0, 0] },
}

type BendDirection = 'left' | 'right'

type PathSegment =
  | {
      kind: 'line'
      start: Vector3
      heading: number
      length: number
      startDistance: number
      endDistance: number
    }
  | {
      kind: 'arc'
      start: Vector3
      heading: number
      length: number
      startDistance: number
      endDistance: number
      radius: number
      signedAngle: number
    }

export type FibrePathBend = {
  inputIndex: number
  pathT: number
  displayRadius: number
  direction: BendDirection
}

export type FibrePath = {
  source: 'preset' | 'physical_bends' | 'invalid_bends'
  curve: Curve<Vector3>
  bends: FibrePathBend[]
  radiusScale: number
  error: string | null
}

export type FibrePathFrame = {
  t: number
  position: [number, number, number]
  tangent: [number, number, number]
  normal: [number, number, number]
  binormal: [number, number, number]
}

export type LongitudinalSegmentTransform = {
  length: number
  position: [number, number, number]
  quaternion: [number, number, number, number]
}

export function getLongitudinalSegmentTransform(
  start: [number, number, number],
  end: [number, number, number],
): LongitudinalSegmentTransform {
  const delta = new Vector3(
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2],
  )
  const length = delta.length()
  const quaternion =
    length > 0
      ? new Quaternion()
          .setFromUnitVectors(new Vector3(1, 0, 0), delta.normalize())
          .toArray()
      : ([0, 0, 0, 1] as [number, number, number, number])

  return {
    length,
    position: [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      (start[2] + end[2]) / 2,
    ],
    quaternion,
  }
}

class PhysicalFibreCurve extends Curve<Vector3> {
  private readonly segments: PathSegment[]
  private readonly totalLength: number
  private readonly offset = new Vector3()

  constructor(segments: PathSegment[], totalLength: number) {
    super()
    this.segments = segments
    this.totalLength = totalLength
  }

  setOffset(offset: Vector3): void {
    this.offset.copy(offset)
  }

  getPoint(t: number, target = new Vector3()): Vector3 {
    const segment = this.getSegment(t)
    const distance = Math.min(1, Math.max(0, t)) * this.totalLength
    const localDistance = Math.max(
      0,
      Math.min(segment.length, distance - segment.startDistance),
    )

    if (segment.kind === 'line') {
      target.set(
        segment.start.x + Math.cos(segment.heading) * localDistance,
        0,
        segment.start.z + Math.sin(segment.heading) * localDistance,
      )
    } else {
      const direction = Math.sign(segment.signedAngle)
      const localAngle = direction * (localDistance / segment.radius)
      const heading = segment.heading + localAngle
      target.set(
        segment.start.x +
          (segment.radius * (Math.sin(heading) - Math.sin(segment.heading))) /
            direction,
        0,
        segment.start.z -
          (segment.radius * (Math.cos(heading) - Math.cos(segment.heading))) /
            direction,
      )
    }

    return target.add(this.offset)
  }

  getPointAt(t: number, target = new Vector3()): Vector3 {
    return this.getPoint(t, target)
  }

  getTangent(t: number, target = new Vector3()): Vector3 {
    const segment = this.getSegment(t)
    const distance = Math.min(1, Math.max(0, t)) * this.totalLength
    const localDistance = Math.max(
      0,
      Math.min(segment.length, distance - segment.startDistance),
    )
    const heading =
      segment.kind === 'line'
        ? segment.heading
        : segment.heading +
          Math.sign(segment.signedAngle) * (localDistance / segment.radius)

    return target.set(Math.cos(heading), 0, Math.sin(heading)).normalize()
  }

  getTangentAt(t: number, target = new Vector3()): Vector3 {
    return this.getTangent(t, target)
  }

  getLength(): number {
    return this.totalLength
  }

  private getSegment(t: number): PathSegment {
    const distance = Math.min(1, Math.max(0, t)) * this.totalLength
    return (
      this.segments.find((segment) => distance <= segment.endDistance) ??
      this.segments[this.segments.length - 1]
    )
  }
}

function buildPresetCurve(
  route: FibreRouteStyle,
  visualLength: number,
): CatmullRomCurve3 {
  const half = visualLength / 2

  if (route === 'gentle_arc') {
    return new CatmullRomCurve3([
      new Vector3(-half, 0, 0),
      new Vector3(0, 0, visualLength * 0.2),
      new Vector3(half, 0, 0),
    ])
  }

  if (route === 's_bend') {
    return new CatmullRomCurve3([
      new Vector3(-half, 0, 0),
      new Vector3(-half * 0.4, 0, visualLength * 0.18),
      new Vector3(half * 0.4, 0, -visualLength * 0.18),
      new Vector3(half, 0, 0),
    ])
  }

  return new CatmullRomCurve3([
    new Vector3(-half, 0, 0),
    new Vector3(half, 0, 0),
  ])
}

function getDirection(bend: MacrobendInput): BendDirection | null {
  const direction = bend.direction ?? 'left'
  return direction === 'left' || direction === 'right' ? direction : null
}

function validateBends(macrobends: readonly MacrobendInput[]): string | null {
  if (macrobends.length > 32) {
    return 'A physical path accepts at most 32 bends.'
  }

  for (let index = 0; index < macrobends.length; index += 1) {
    const bend = macrobends[index]
    if (
      !Number.isFinite(bend.position_fraction) ||
      bend.position_fraction < 0 ||
      bend.position_fraction > 1 ||
      !Number.isFinite(bend.radius_mm) ||
      bend.radius_mm <= 0 ||
      !Number.isFinite(bend.angle_deg) ||
      bend.angle_deg <= 0 ||
      bend.angle_deg > 360 ||
      getDirection(bend) === null
    ) {
      return `Bend ${index + 1} has invalid physical path data.`
    }
    if (
      index > 0 &&
      macrobends[index - 1].position_fraction >= bend.position_fraction
    ) {
      return 'Bend positions must increase along the fibre.'
    }
  }

  return null
}

function bendDisplayRadius(radiusMm: number, visualLength: number): number {
  return visualLength * (0.06 + (0.2 * radiusMm) / (radiusMm + 15))
}

function buildPhysicalFibrePath(
  visualLength: number,
  macrobends: readonly MacrobendInput[],
): FibrePath {
  if (!Number.isFinite(visualLength) || visualLength <= 0) {
    return {
      source: 'invalid_bends',
      curve: buildPresetCurve('straight', 0),
      bends: [],
      radiusScale: 0,
      error: 'The physical path requires a finite positive display length.',
    }
  }

  const error = validateBends(macrobends)
  if (error !== null) {
    return {
      source: 'invalid_bends',
      curve: buildPresetCurve('straight', visualLength),
      bends: [],
      radiusScale: 0,
      error,
    }
  }

  const bendData = macrobends.map((bend, inputIndex) => {
    const pathT = bend.position_fraction
    const direction = getDirection(bend) as BendDirection
    const signedAngle =
      (bend.angle_deg * Math.PI * (direction === 'left' ? 1 : -1)) / 180
    const displayRadius = bendDisplayRadius(bend.radius_mm, visualLength)
    const baseArcLength = displayRadius * Math.abs(signedAngle)
    const leftLength =
      pathT === 0 ? 0 : pathT === 1 ? baseArcLength : baseArcLength / 2
    const rightLength =
      pathT === 1 ? 0 : pathT === 0 ? baseArcLength : baseArcLength / 2

    return {
      inputIndex,
      pathT,
      direction,
      signedAngle,
      displayRadius,
      leftLength,
      rightLength,
    }
  })

  let radiusScale = 1
  for (const bend of bendData) {
    if (bend.leftLength > 0) {
      radiusScale = Math.min(
        radiusScale,
        (bend.pathT * visualLength) / bend.leftLength,
      )
    }
    if (bend.rightLength > 0) {
      radiusScale = Math.min(
        radiusScale,
        ((1 - bend.pathT) * visualLength) / bend.rightLength,
      )
    }
  }
  for (let index = 1; index < bendData.length; index += 1) {
    const previous = bendData[index - 1]
    const current = bendData[index]
    const occupiedLength = previous.rightLength + current.leftLength
    if (occupiedLength > 0) {
      radiusScale = Math.min(
        radiusScale,
        ((current.pathT - previous.pathT) * visualLength) / occupiedLength,
      )
    }
  }
  radiusScale = Math.min(1, Math.max(0, radiusScale))
  if (!Number.isFinite(radiusScale) || radiusScale < 0.0001) {
    return {
      source: 'invalid_bends',
      curve: buildPresetCurve('straight', visualLength),
      bends: [],
      radiusScale: 0,
      error: 'Bend stations are too close for a stable display path.',
    }
  }

  const intervals = bendData.map((bend) => ({
    ...bend,
    displayRadius: bend.displayRadius * radiusScale,
    startDistance: bend.pathT * visualLength - bend.leftLength * radiusScale,
    endDistance: bend.pathT * visualLength + bend.rightLength * radiusScale,
  }))
  const segments: PathSegment[] = []
  let currentPoint = new Vector3()
  let currentDistance = 0
  let heading = 0

  for (const bend of intervals) {
    const lineLength = bend.startDistance - currentDistance
    if (lineLength > 0) {
      segments.push({
        kind: 'line',
        start: currentPoint.clone(),
        heading,
        length: lineLength,
        startDistance: currentDistance,
        endDistance: bend.startDistance,
      })
      currentPoint = new Vector3(
        currentPoint.x + Math.cos(heading) * lineLength,
        0,
        currentPoint.z + Math.sin(heading) * lineLength,
      )
    }

    const arcLength = bend.endDistance - bend.startDistance
    segments.push({
      kind: 'arc',
      start: currentPoint.clone(),
      heading,
      length: arcLength,
      startDistance: bend.startDistance,
      endDistance: bend.endDistance,
      radius: bend.displayRadius,
      signedAngle: bend.signedAngle,
    })
    const nextHeading = heading + bend.signedAngle
    const direction = Math.sign(bend.signedAngle)
    currentPoint = new Vector3(
      currentPoint.x +
        (bend.displayRadius * (Math.sin(nextHeading) - Math.sin(heading))) /
          direction,
      0,
      currentPoint.z -
        (bend.displayRadius * (Math.cos(nextHeading) - Math.cos(heading))) /
          direction,
    )
    currentDistance = bend.endDistance
    heading = nextHeading
  }

  if (currentDistance < visualLength) {
    const lineLength = visualLength - currentDistance
    segments.push({
      kind: 'line',
      start: currentPoint.clone(),
      heading,
      length: lineLength,
      startDistance: currentDistance,
      endDistance: visualLength,
    })
  }

  const curve = new PhysicalFibreCurve(segments, visualLength)
  const minimum = new Vector3(
    Number.POSITIVE_INFINITY,
    0,
    Number.POSITIVE_INFINITY,
  )
  const maximum = new Vector3(
    Number.NEGATIVE_INFINITY,
    0,
    Number.NEGATIVE_INFINITY,
  )
  for (let index = 0; index <= 256; index += 1) {
    const point = curve.getPointAt(index / 256)
    minimum.min(point)
    maximum.max(point)
  }
  curve.setOffset(
    new Vector3(-(minimum.x + maximum.x) / 2, 0, -(minimum.z + maximum.z) / 2),
  )

  return {
    source: 'physical_bends',
    curve,
    bends: intervals.map((bend) => ({
      inputIndex: bend.inputIndex,
      pathT: bend.pathT,
      displayRadius: bend.displayRadius,
      direction: bend.direction,
    })),
    radiusScale,
    error: null,
  }
}

export function buildFibrePath(
  route: FibreRouteStyle,
  visualLength: number,
  macrobends: readonly MacrobendInput[] | null | undefined = null,
): FibrePath {
  if (macrobends && macrobends.length > 0) {
    return buildPhysicalFibrePath(visualLength, macrobends)
  }

  return {
    source: 'preset',
    curve: buildPresetCurve(route, visualLength),
    bends: [],
    radiusScale: 1,
    error: null,
  }
}

export function buildFibreCurve(
  route: FibreRouteStyle,
  visualLength: number,
  macrobends: readonly MacrobendInput[] | null | undefined = null,
): Curve<Vector3> {
  return buildFibrePath(route, visualLength, macrobends).curve
}

export function getFibrePathFrame(path: FibrePath, t: number): FibrePathFrame {
  const normalizedT = Math.min(1, Math.max(0, t))
  const point = path.curve.getPointAt(normalizedT)
  const tangent = path.curve.getTangentAt(normalizedT).normalize()
  const normal = new Vector3(0, 1, 0)
  const binormal = tangent.clone().cross(normal).normalize()

  return {
    t: normalizedT,
    position: [point.x, point.y, point.z],
    tangent: [tangent.x, tangent.y, tangent.z],
    normal: [normal.x, normal.y, normal.z],
    binormal: [binormal.x, binormal.y, binormal.z],
  }
}

export function sampleFibrePathFrames(
  path: FibrePath,
  sampleCount: number,
): FibrePathFrame[] {
  if (!Number.isFinite(sampleCount) || sampleCount < 1) {
    return []
  }

  const count = Math.max(2, Math.floor(sampleCount))
  return Array.from({ length: count }, (_, index) =>
    getFibrePathFrame(path, index / (count - 1)),
  )
}

export type PathSample = {
  t: number
  position: [number, number, number]
}

export function sampleFibrePath(
  route: FibreRouteStyle,
  visualLength: number,
  sampleCount: number,
  path = buildFibrePath(route, visualLength),
): PathSample[] {
  if (
    !Number.isFinite(visualLength) ||
    visualLength < 0 ||
    !Number.isFinite(sampleCount) ||
    sampleCount < 1
  ) {
    return []
  }

  const count = Math.max(2, Math.floor(sampleCount))
  const samples: PathSample[] = []

  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1)
    const point = path.curve.getPointAt(t)
    samples.push({
      t,
      position: [point.x, point.y, point.z],
    })
  }

  return samples
}

export function getCurveMidpoint(
  route: FibreRouteStyle,
  visualLength: number,
  path = buildFibrePath(route, visualLength),
): [number, number, number] {
  if (!Number.isFinite(visualLength) || visualLength < 0) {
    return [0, 0, 0]
  }

  const point = path.curve.getPointAt(0.5)
  return [point.x, point.y, point.z]
}

export type SpatialPowerMarker = {
  t: number
  distanceKm: number
  position: [number, number, number]
  powerDbm: number
  normalizedPower: number
  radius: number
  color: string
}

function powerToColor(normalized: number): string {
  const t = Math.min(1, Math.max(0, normalized))
  const red = Math.round(255 * (0.25 + 0.75 * (1 - t)))
  const green = Math.round(255 * (0.35 + 0.45 * t))
  const blue = Math.round(255 * (0.85 * t + 0.15))
  return `rgb(${red}, ${green}, ${blue})`
}

type ValidPowerSamples = {
  lengthKm: number
  distanceSamplesKm: number[]
  powerSamplesDbm: number[]
}

function getValidPowerSamples(
  attenuation: PowerDistanceData | null | undefined,
): ValidPowerSamples | null {
  if (
    attenuation === null ||
    attenuation === undefined ||
    !Number.isFinite(attenuation.lengthKm) ||
    attenuation.lengthKm < 0 ||
    !Array.isArray(attenuation.distanceSamplesKm) ||
    !Array.isArray(attenuation.powerSamplesDbm) ||
    attenuation.distanceSamplesKm.length < 1 ||
    attenuation.distanceSamplesKm.length !== attenuation.powerSamplesDbm.length
  ) {
    return null
  }

  const { distanceSamplesKm, powerSamplesDbm, lengthKm } = attenuation

  for (let index = 0; index < distanceSamplesKm.length; index += 1) {
    const distance = distanceSamplesKm[index]
    const power = powerSamplesDbm[index]

    if (
      !Number.isFinite(distance) ||
      !Number.isFinite(power) ||
      distance < 0 ||
      distance > lengthKm ||
      (index > 0 && distance <= distanceSamplesKm[index - 1])
    ) {
      return null
    }
  }

  if (
    distanceSamplesKm[0] !== 0 ||
    distanceSamplesKm[distanceSamplesKm.length - 1] !== lengthKm
  ) {
    return null
  }

  if (lengthKm === 0 && distanceSamplesKm.length !== 1) {
    return null
  }

  return { lengthKm, distanceSamplesKm, powerSamplesDbm }
}

function selectPowerSampleIndexes(
  distances: number[],
  lengthKm: number,
  markerCount: number,
): number[] {
  const count = Math.floor(markerCount)

  if (!Number.isFinite(markerCount) || count < 1) {
    return []
  }

  if (distances.length === 1) {
    return count >= 1 ? [0] : []
  }

  if (count < 2) {
    return []
  }

  if (count >= distances.length) {
    return distances.map((_, index) => index)
  }

  const selected = new Set<number>([0, distances.length - 1])

  for (let index = 1; index < count - 1; index += 1) {
    const targetDistance = (index / (count - 1)) * lengthKm
    let closestIndex = -1
    let closestDifference = Number.POSITIVE_INFINITY

    for (
      let sampleIndex = 1;
      sampleIndex < distances.length - 1;
      sampleIndex += 1
    ) {
      if (selected.has(sampleIndex)) {
        continue
      }

      const difference = Math.abs(distances[sampleIndex] - targetDistance)
      if (difference < closestDifference) {
        closestIndex = sampleIndex
        closestDifference = difference
      }
    }

    if (closestIndex >= 0) {
      selected.add(closestIndex)
    }
  }

  return [...selected].sort((left, right) => left - right)
}

export function getSpatialPowerMarkers(
  route: FibreRouteStyle,
  visualLength: number,
  attenuation: PowerDistanceData | null | undefined,
  markerCount = 6,
  path = buildFibrePath(route, visualLength),
): SpatialPowerMarker[] {
  if (!Number.isFinite(visualLength) || visualLength < 0) {
    return []
  }

  const samples = getValidPowerSamples(attenuation)
  if (samples === null) {
    return []
  }

  const indexes = selectPowerSampleIndexes(
    samples.distanceSamplesKm,
    samples.lengthKm,
    markerCount,
  )
  if (indexes.length === 0) {
    return []
  }

  const powers = samples.powerSamplesDbm
  const minPower = Math.min(...powers)
  const maxPower = Math.max(...powers)
  const span = maxPower - minPower
  return indexes.map((sampleIndex) => {
    const distance = samples.distanceSamplesKm[sampleIndex]
    const t = samples.lengthKm === 0 ? 0 : distance / samples.lengthKm
    const point = path.curve.getPointAt(t)
    const powerDbm = powers[sampleIndex]
    const normalizedPower = span === 0 ? 0.5 : (powerDbm - minPower) / span

    return {
      t,
      distanceKm: distance,
      position: [point.x, point.y, point.z],
      powerDbm,
      normalizedPower,
      radius: 0.08 + normalizedPower * 0.14,
      color: powerToColor(normalizedPower),
    }
  })
}

export type SpatialPulseMarker = {
  id: 'input' | 'output'
  label: string
  position: [number, number, number]
  fwhmPs: number
  radius: number
  color: string
}

export function getSpatialPulseMarkers(
  route: FibreRouteStyle,
  visualLength: number,
  pulse: PulseAnimationData | null,
  path = buildFibrePath(route, visualLength),
): SpatialPulseMarker[] {
  if (
    !Number.isFinite(visualLength) ||
    visualLength < 0 ||
    pulse === null ||
    !Number.isFinite(pulse.inputPulseFwhmPs) ||
    !Number.isFinite(pulse.outputPulseFwhmPs) ||
    pulse.inputPulseFwhmPs <= 0 ||
    pulse.outputPulseFwhmPs <= 0
  ) {
    return []
  }

  const samples = sampleFibrePath(route, visualLength, 2, path)
  if (samples.length < 2) {
    return []
  }

  const maxFwhm = Math.max(pulse.inputPulseFwhmPs, pulse.outputPulseFwhmPs)

  return [
    {
      id: 'input',
      label: 'Input FWHM',
      position: samples[0].position,
      fwhmPs: pulse.inputPulseFwhmPs,
      radius: 0.12 + (pulse.inputPulseFwhmPs / maxFwhm) * 0.16,
      color: '#7dd3fc',
    },
    {
      id: 'output',
      label: 'Output FWHM',
      position: samples[samples.length - 1].position,
      fwhmPs: pulse.outputPulseFwhmPs,
      radius: 0.12 + (pulse.outputPulseFwhmPs / maxFwhm) * 0.16,
      color: '#fbbf24',
    },
  ]
}

export type ScaleMarker = {
  t: number
  position: [number, number, number]
  label: string
}

export function getScaleMarkers(
  route: FibreRouteStyle,
  visualLength: number,
  sectionLengthKm: number | null,
  tickCount = 5,
  fibrePath = buildFibrePath(route, visualLength),
): ScaleMarker[] {
  const path = sampleFibrePath(route, visualLength, tickCount, fibrePath)
  const hasPhysical =
    sectionLengthKm !== null &&
    Number.isFinite(sectionLengthKm) &&
    sectionLengthKm >= 0

  return path.map((sample, sampleIndex) => {
    const physicalLabel = hasPhysical
      ? `${((sectionLengthKm as number) * sample.t).toFixed(2)} km`
      : `${(sample.t * 100).toFixed(0)}%`

    return {
      t: sample.t,
      position: sample.position,
      label:
        sampleIndex === 0
          ? `0 (${physicalLabel})`
          : sampleIndex === path.length - 1
            ? `L (${physicalLabel})`
            : physicalLabel,
    }
  })
}

export type SpatialBendMarker = {
  id: string
  positionFraction: number
  position: [number, number, number]
  tangent: [number, number, number]
  quaternion: [number, number, number, number]
  lossDb: number
  cumulativeLossDb: number
  outputPowerDbm: number | null
  remainingPowerFraction: number
  direction: BendDirection
  displayRadius: number
}

export function getTangentQuaternion(
  tangent: [number, number, number],
): [number, number, number, number] {
  const y = -tangent[2]
  const w = 1 + tangent[0]
  if (Math.abs(w) < 1e-12) {
    return [0, 1, 0, 0]
  }

  const length = Math.hypot(y, w)
  const normalizedY = y / length
  return [0, Math.abs(normalizedY) < 1e-15 ? 0 : normalizedY, 0, w / length]
}

export function getSpatialBendMarkers(
  route: FibreRouteStyle,
  visualLength: number,
  macrobends: readonly MacrobendInput[] | null | undefined,
  path = buildFibrePath(route, visualLength, macrobends),
  bendLoss: MacrobendLossResult | null | undefined = null,
): SpatialBendMarker[] {
  if (
    !Number.isFinite(visualLength) ||
    visualLength < 0 ||
    !macrobends ||
    macrobends.length === 0
  ) {
    return []
  }

  return macrobends.map((bend, bendIndex) => {
    const t = Math.max(0, Math.min(1, bend.position_fraction))
    const frame = getFibrePathFrame(path, t)
    const pathBend = path.bends.find((item) => item.inputIndex === bendIndex)
    const lossPoint = bendLoss?.bends[bendIndex]
    const cumulativeLossDb =
      lossPoint?.position_fraction === bend.position_fraction
        ? lossPoint.cumulative_bend_loss_db
        : macrobends
            .slice(0, bendIndex + 1)
            .reduce((total, item) => total + item.supplied_loss_db, 0)
    const outputPowerDbm =
      lossPoint?.position_fraction === bend.position_fraction
        ? lossPoint.output_power_dbm
        : null
    return {
      id: `bend-${bendIndex}-${bend.position_fraction}`,
      positionFraction: t,
      position: frame.position,
      tangent: frame.tangent,
      quaternion: getTangentQuaternion(frame.tangent),
      lossDb: bend.supplied_loss_db,
      cumulativeLossDb,
      outputPowerDbm,
      remainingPowerFraction: Math.pow(10, -cumulativeLossDb / 10),
      direction: pathBend?.direction ?? getDirection(bend) ?? 'left',
      displayRadius: pathBend?.displayRadius ?? 0,
    }
  })
}
