export const PULSE_COMPARISON_VIEW_BOX = '0 0 720 420'

export const PULSE_COMPARISON_SVG = {
  width: 720,
  height: 420,
  plotLeft: 76,
  plotTop: 24,
  plotWidth: 614,
  plotHeight: 316,
} as const

export const PULSE_COMPARISON_SAMPLE_COUNT = 65
export const PULSE_COMPARISON_MODEL_ID =
  'first_order_chromatic_pulse_broadening'
export const PULSE_COMPARISON_MODEL_VERSION = '1.0.0'
export const PULSE_COMPARISON_WIDTH_CONVENTION = 'fwhm' as const

export type PulseComparisonData = {
  lengthKm: number
  dispersionPsPerNmKm: number
  spectralWidthFwhmNm: number
  inputPulseFwhmPs: number
  accumulatedDispersionPsPerNm: number
  dispersionBroadeningFwhmPs: number
  outputPulseFwhmPs: number
  modelId: string
  modelVersion: string
  widthConvention: string
}

export type GaussianPulseSample = {
  timePs: number
  normalizedTime: number
  normalizedValue: number
}

export type PulseComparisonSvgPoint = GaussianPulseSample & {
  x: number
  y: number
}

export type PulseFwhmMarker = {
  fwhmPs: number
  leftX: number
  rightX: number
  y: number
}

export type PulseComparisonSvgMapping = {
  inputPoints: PulseComparisonSvgPoint[]
  outputPoints: PulseComparisonSvgPoint[]
  inputFwhmMarker: PulseFwhmMarker
  outputFwhmMarker: PulseFwhmMarker
  xDomain: readonly [number, number]
  yDomain: readonly [number, number]
}

export type PulseComparisonPlotData = PulseComparisonData & {
  inputProfile: GaussianPulseSample[]
  outputProfile: GaussianPulseSample[]
  svg: PulseComparisonSvgMapping
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isValidPulseComparisonData(
  value: unknown,
): value is PulseComparisonData {
  if (!isRecord(value)) {
    return false
  }

  return (
    isFiniteNumber(value.lengthKm) &&
    value.lengthKm >= 0 &&
    isFiniteNumber(value.dispersionPsPerNmKm) &&
    isFiniteNumber(value.spectralWidthFwhmNm) &&
    value.spectralWidthFwhmNm >= 0 &&
    isFiniteNumber(value.inputPulseFwhmPs) &&
    value.inputPulseFwhmPs > 0 &&
    isFiniteNumber(value.accumulatedDispersionPsPerNm) &&
    isFiniteNumber(value.dispersionBroadeningFwhmPs) &&
    value.dispersionBroadeningFwhmPs >= 0 &&
    isFiniteNumber(value.outputPulseFwhmPs) &&
    value.outputPulseFwhmPs >= value.inputPulseFwhmPs &&
    value.modelId === PULSE_COMPARISON_MODEL_ID &&
    value.modelVersion === PULSE_COMPARISON_MODEL_VERSION &&
    value.widthConvention === PULSE_COMPARISON_WIDTH_CONVENTION
  )
}

export function gaussianPulseProfileValue(normalizedTime: number): number {
  if (normalizedTime === 0) {
    return 1
  }

  if (normalizedTime === -0.5 || normalizedTime === 0.5) {
    return 0.5
  }

  return Math.exp(-4 * Math.LN2 * normalizedTime ** 2)
}

export function generateGaussianProfile(fwhmPs: number): GaussianPulseSample[] {
  if (!Number.isFinite(fwhmPs) || fwhmPs <= 0) {
    return []
  }

  return Array.from({ length: PULSE_COMPARISON_SAMPLE_COUNT }, (_, index) => {
    const normalizedTime =
      -1 + (2 * index) / (PULSE_COMPARISON_SAMPLE_COUNT - 1)

    return {
      timePs: fwhmPs * normalizedTime,
      normalizedTime,
      normalizedValue: gaussianPulseProfileValue(normalizedTime),
    }
  })
}

function mapRatioToX(relativeTimeInOutputWidths: number): number {
  return (
    PULSE_COMPARISON_SVG.plotLeft +
    ((relativeTimeInOutputWidths + 1) / 2) * PULSE_COMPARISON_SVG.plotWidth
  )
}

function mapValueToY(normalizedValue: number): number {
  return (
    PULSE_COMPARISON_SVG.plotTop +
    (1 - normalizedValue) * PULSE_COMPARISON_SVG.plotHeight
  )
}

function mapProfileToSvg(
  profile: GaussianPulseSample[],
  fwhmToOutputRatio: number,
): PulseComparisonSvgPoint[] {
  return profile.map((sample) => ({
    ...sample,
    x: mapRatioToX(sample.normalizedTime * fwhmToOutputRatio),
    y: mapValueToY(sample.normalizedValue),
  }))
}

function createFwhmMarker(
  fwhmPs: number,
  fwhmToOutputRatio: number,
): PulseFwhmMarker {
  const halfWidthInOutputWidths = fwhmToOutputRatio / 2

  return {
    fwhmPs,
    leftX: mapRatioToX(-halfWidthInOutputWidths),
    rightX: mapRatioToX(halfWidthInOutputWidths),
    y: mapValueToY(0.5),
  }
}

export function mapPulseComparisonToSvg(
  data: PulseComparisonData,
  inputProfile = generateGaussianProfile(data.inputPulseFwhmPs),
  outputProfile = generateGaussianProfile(data.outputPulseFwhmPs),
): PulseComparisonSvgMapping {
  const inputToOutputRatio = data.inputPulseFwhmPs / data.outputPulseFwhmPs

  return {
    inputPoints: mapProfileToSvg(inputProfile, inputToOutputRatio),
    outputPoints: mapProfileToSvg(outputProfile, 1),
    inputFwhmMarker: createFwhmMarker(
      data.inputPulseFwhmPs,
      inputToOutputRatio,
    ),
    outputFwhmMarker: createFwhmMarker(data.outputPulseFwhmPs, 1),
    xDomain: [-data.outputPulseFwhmPs, data.outputPulseFwhmPs],
    yDomain: [0, 1],
  }
}

export function getPulseComparisonPlotData(
  data: PulseComparisonData | null | undefined,
): PulseComparisonPlotData | null {
  if (!isValidPulseComparisonData(data)) {
    return null
  }

  const inputProfile = generateGaussianProfile(data.inputPulseFwhmPs)
  const outputProfile = generateGaussianProfile(data.outputPulseFwhmPs)

  return {
    ...data,
    inputProfile,
    outputProfile,
    svg: mapPulseComparisonToSvg(data, inputProfile, outputProfile),
  }
}
