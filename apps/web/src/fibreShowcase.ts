import { CatmullRomCurve3, Vector3 } from 'three'

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

export function buildFibreCurve(
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

export type PathSample = {
  t: number
  position: [number, number, number]
}

export function sampleFibrePath(
  route: FibreRouteStyle,
  visualLength: number,
  sampleCount: number,
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
  const curve = buildFibreCurve(route, visualLength)
  const samples: PathSample[] = []

  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1)
    const point = curve.getPointAt(t)
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
): [number, number, number] {
  if (!Number.isFinite(visualLength) || visualLength < 0) {
    return [0, 0, 0]
  }

  const point = buildFibreCurve(route, visualLength).getPointAt(0.5)
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
  const curve = buildFibreCurve(route, visualLength)

  return indexes.map((sampleIndex) => {
    const distance = samples.distanceSamplesKm[sampleIndex]
    const t = samples.lengthKm === 0 ? 0 : distance / samples.lengthKm
    const point = curve.getPointAt(t)
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

  const path = sampleFibrePath(route, visualLength, 2)
  if (path.length < 2) {
    return []
  }

  const maxFwhm = Math.max(pulse.inputPulseFwhmPs, pulse.outputPulseFwhmPs)

  return [
    {
      id: 'input',
      label: 'Input FWHM',
      position: path[0].position,
      fwhmPs: pulse.inputPulseFwhmPs,
      radius: 0.12 + (pulse.inputPulseFwhmPs / maxFwhm) * 0.16,
      color: '#7dd3fc',
    },
    {
      id: 'output',
      label: 'Output FWHM',
      position: path[path.length - 1].position,
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
): ScaleMarker[] {
  const path = sampleFibrePath(route, visualLength, tickCount)
  const hasPhysical =
    sectionLengthKm !== null &&
    Number.isFinite(sectionLengthKm) &&
    sectionLengthKm >= 0

  return path.map((sample, index) => {
    const physicalLabel = hasPhysical
      ? `${((sectionLengthKm as number) * sample.t).toFixed(2)} km`
      : `${(sample.t * 100).toFixed(0)}%`

    return {
      t: sample.t,
      position: sample.position,
      label:
        index === 0
          ? `0 (${physicalLabel})`
          : index === path.length - 1
            ? `L (${physicalLabel})`
            : physicalLabel,
    }
  })
}
