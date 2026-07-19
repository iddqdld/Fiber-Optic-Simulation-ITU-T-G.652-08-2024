export const POWER_DISTANCE_VIEW_BOX = '0 0 720 420'

export const POWER_DISTANCE_SVG = {
  width: 720,
  height: 420,
  plotLeft: 76,
  plotTop: 24,
  plotWidth: 614,
  plotHeight: 316,
} as const

export const POWER_DISTANCE_MODEL_ID = 'constant_fibre_attenuation'
export const POWER_DISTANCE_MODEL_VERSION = '1.0.0'

export type PowerDistanceData = {
  lengthKm: number
  attenuationDbPerKm: number
  inputPowerDbm: number
  sectionLossDb: number
  outputPowerDbm: number
  distanceSamplesKm: number[]
  powerSamplesDbm: number[]
  modelId: string
  modelVersion: string
}

export type PowerDistancePoint = {
  distanceKm: number
  powerDbm: number
  x: number
  y: number
}

export type PowerDistanceSvgMapping = {
  points: PowerDistancePoint[]
  xDomain: readonly [number, number]
  yDomain: readonly [number, number]
  isConstantPower: boolean
  isZeroLength: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFiniteNumberArray(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 65) {
    return false
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!isFiniteNumber(value[index])) {
      return false
    }
  }

  return true
}

function isStrictlyIncreasing(values: number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (!(values[index] > values[index - 1])) {
      return false
    }
  }

  return true
}

function isNonIncreasing(values: number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[index - 1]) {
      return false
    }
  }

  return true
}

export function isValidPowerDistanceData(
  value: unknown,
): value is PowerDistanceData {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.lengthKm) ||
    value.lengthKm < 0 ||
    !isFiniteNumber(value.attenuationDbPerKm) ||
    value.attenuationDbPerKm < 0 ||
    !isFiniteNumber(value.inputPowerDbm) ||
    !isFiniteNumber(value.sectionLossDb) ||
    value.sectionLossDb < 0 ||
    !isFiniteNumber(value.outputPowerDbm) ||
    value.outputPowerDbm > value.inputPowerDbm ||
    value.modelId !== POWER_DISTANCE_MODEL_ID ||
    value.modelVersion !== POWER_DISTANCE_MODEL_VERSION ||
    !isFiniteNumberArray(value.distanceSamplesKm) ||
    !isFiniteNumberArray(value.powerSamplesDbm) ||
    value.distanceSamplesKm.length !== value.powerSamplesDbm.length
  ) {
    return false
  }

  const { distanceSamplesKm, powerSamplesDbm, lengthKm } = value
  const lastDistance = distanceSamplesKm[distanceSamplesKm.length - 1]
  const lastPower = powerSamplesDbm[powerSamplesDbm.length - 1]

  if (
    distanceSamplesKm[0] !== 0 ||
    powerSamplesDbm[0] !== value.inputPowerDbm ||
    lastPower !== value.outputPowerDbm ||
    !isNonIncreasing(powerSamplesDbm)
  ) {
    return false
  }

  if (lengthKm === 0) {
    return (
      distanceSamplesKm.length === 1 &&
      lastDistance === 0 &&
      lastDistance === lengthKm
    )
  }

  return lastDistance === lengthKm && isStrictlyIncreasing(distanceSamplesKm)
}

export function mapPowerDistanceToSvg(
  data: PowerDistanceData,
): PowerDistanceSvgMapping {
  const distanceStart = data.distanceSamplesKm[0]
  const distanceEnd = data.distanceSamplesKm[data.distanceSamplesKm.length - 1]
  const powerMin = Math.min(...data.powerSamplesDbm)
  const powerMax = Math.max(...data.powerSamplesDbm)
  const distanceSpan = distanceEnd - distanceStart
  const powerSpan = powerMax - powerMin
  const xDomain: readonly [number, number] = [distanceStart, distanceEnd]
  const yDomain: readonly [number, number] = [powerMin, powerMax]

  const points = data.distanceSamplesKm.map((distanceKm, index) => ({
    distanceKm,
    powerDbm: data.powerSamplesDbm[index],
    x:
      distanceSpan === 0
        ? POWER_DISTANCE_SVG.plotLeft + POWER_DISTANCE_SVG.plotWidth / 2
        : POWER_DISTANCE_SVG.plotLeft +
          ((distanceKm - distanceStart) / distanceSpan) *
            POWER_DISTANCE_SVG.plotWidth,
    y:
      powerSpan === 0
        ? POWER_DISTANCE_SVG.plotTop + POWER_DISTANCE_SVG.plotHeight / 2
        : POWER_DISTANCE_SVG.plotTop +
          ((powerMax - data.powerSamplesDbm[index]) / powerSpan) *
            POWER_DISTANCE_SVG.plotHeight,
  }))

  return {
    points,
    xDomain,
    yDomain,
    isConstantPower: powerSpan === 0,
    isZeroLength: distanceSpan === 0,
  }
}

export function getPowerDistancePlotData(
  data: PowerDistanceData | null | undefined,
): (PowerDistanceData & { svg: PowerDistanceSvgMapping }) | null {
  if (!isValidPowerDistanceData(data)) {
    return null
  }

  return {
    ...data,
    svg: mapPowerDistanceToSvg(data),
  }
}
