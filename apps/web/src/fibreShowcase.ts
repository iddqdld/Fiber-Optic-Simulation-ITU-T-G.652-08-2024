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
  const count = Math.max(2, Math.floor(sampleCount))
  const curve = buildFibreCurve(route, visualLength)
  const samples: PathSample[] = []

  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1)
    const point = curve.getPoint(t)
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
  const point = buildFibreCurve(route, visualLength).getPoint(0.5)
  return [point.x, point.y, point.z]
}

export type SpatialPowerMarker = {
  t: number
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

export function getSpatialPowerMarkers(
  route: FibreRouteStyle,
  visualLength: number,
  attenuation: PowerDistanceData | null,
  markerCount = 6,
): SpatialPowerMarker[] {
  if (
    attenuation === null ||
    attenuation.distanceSamplesKm.length < 1 ||
    attenuation.powerSamplesDbm.length !==
      attenuation.distanceSamplesKm.length
  ) {
    return []
  }

  const powers = attenuation.powerSamplesDbm
  const minPower = Math.min(...powers)
  const maxPower = Math.max(...powers)
  const span = Math.max(1e-9, maxPower - minPower)
  const path = sampleFibrePath(route, visualLength, markerCount)

  return path.map((sample) => {
    const sampleIndex = Math.min(
      powers.length - 1,
      Math.round(sample.t * (powers.length - 1)),
    )
    const powerDbm = powers[sampleIndex]
    const normalizedPower = (powerDbm - minPower) / span

    return {
      t: sample.t,
      position: sample.position,
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
    pulse === null ||
    !Number.isFinite(pulse.inputPulseFwhmPs) ||
    !Number.isFinite(pulse.outputPulseFwhmPs) ||
    pulse.inputPulseFwhmPs <= 0 ||
    pulse.outputPulseFwhmPs <= 0
  ) {
    return []
  }

  const path = sampleFibrePath(route, visualLength, 2)
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
