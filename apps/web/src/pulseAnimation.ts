export type PulseAnimationData = {
  inputPulseFwhmPs: number
  outputPulseFwhmPs: number
  dispersionBroadeningFwhmPs: number
  sectionLengthKm: number
  groupDelayPs: number
  modelId: string
  modelVersion: string
  widthConvention: 'fwhm'
  delayModelId: string
  delayModelVersion: string
}

export const PULSE_VISUAL_DURATION_SECONDS = 4
export const PULSE_MAX_VISUAL_WIDTH_RATIO = 4
export const PULSE_ENVELOPE_BASE_WIDTH = 0.55
export const PULSE_ENVELOPE_TRANSVERSE_RADIUS = 0.74
export const PULSE_MODEL_ID = 'first_order_chromatic_pulse_broadening'
export const PULSE_MODEL_VERSION = '1.0.0'
export const PULSE_DELAY_MODEL_ID = 'constant_group_index_delay'
export const PULSE_DELAY_MODEL_VERSION = '1.0.0'
export const PULSE_WIDTH_CONVENTION = 'fwhm' as const

export type PulseAnimationVisualTransform = {
  progress: number
  positionX: number
  visualWidthRatio: number
  longitudinalScale: number
  transverseScale: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isValidPulseAnimationData(
  data: PulseAnimationData | null | undefined,
): data is PulseAnimationData {
  return (
    data !== null &&
    data !== undefined &&
    isFiniteNumber(data.inputPulseFwhmPs) &&
    data.inputPulseFwhmPs > 0 &&
    isFiniteNumber(data.outputPulseFwhmPs) &&
    data.outputPulseFwhmPs >= data.inputPulseFwhmPs &&
    isFiniteNumber(data.dispersionBroadeningFwhmPs) &&
    data.dispersionBroadeningFwhmPs >= 0 &&
    isFiniteNumber(data.sectionLengthKm) &&
    data.sectionLengthKm > 0 &&
    isFiniteNumber(data.groupDelayPs) &&
    data.groupDelayPs > 0 &&
    data.modelId === PULSE_MODEL_ID &&
    data.modelVersion === PULSE_MODEL_VERSION &&
    data.widthConvention === PULSE_WIDTH_CONVENTION &&
    data.delayModelId === PULSE_DELAY_MODEL_ID &&
    data.delayModelVersion === PULSE_DELAY_MODEL_VERSION
  )
}

export function getPulseAnimationUnavailableReason(
  data: PulseAnimationData | null | undefined,
): string | null {
  if (data === null || data === undefined) {
    return 'backend pulse and group-delay data are required'
  }

  if (!isValidPulseAnimationData(data)) {
    return 'finite positive timing values, non-negative broadening, exact model manifests, and the fwhm convention are required'
  }

  return null
}

export function clampPulseProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0
  }

  return Math.min(1, Math.max(0, progress))
}

export function getPulseAnimationProgress(elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds)) {
    return 0
  }

  return clampPulseProgress(elapsedSeconds / PULSE_VISUAL_DURATION_SECONDS)
}

export function advancePulseAnimationTime(
  elapsedSeconds: number,
  deltaSeconds: number,
): number {
  const elapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0

  return Math.min(PULSE_VISUAL_DURATION_SECONDS, elapsed + delta)
}

export function shouldInvalidatePulseAnimationFrame(
  isPlaying: boolean,
  progress: number,
): boolean {
  return isPlaying && clampPulseProgress(progress) < 1
}

export function getPulseVisualWidthRatio(
  data: PulseAnimationData,
  progress: number,
): number {
  const clampedProgress = clampPulseProgress(progress)
  const uncappedRatio = data.outputPulseFwhmPs / data.inputPulseFwhmPs
  const outputRatio = Math.min(PULSE_MAX_VISUAL_WIDTH_RATIO, uncappedRatio)

  return 1 + (outputRatio - 1) * clampedProgress
}

export function getPulseAnimationVisualTransform(
  data: PulseAnimationData,
  visualLength: number,
  progress: number,
): PulseAnimationVisualTransform {
  const clampedProgress = clampPulseProgress(progress)
  const safeVisualLength = Number.isFinite(visualLength)
    ? Math.max(0, visualLength)
    : 0
  const visualWidthRatio = getPulseVisualWidthRatio(data, clampedProgress)

  return {
    progress: clampedProgress,
    positionX: -safeVisualLength / 2 + safeVisualLength * clampedProgress,
    visualWidthRatio,
    longitudinalScale: PULSE_ENVELOPE_BASE_WIDTH * visualWidthRatio,
    transverseScale: PULSE_ENVELOPE_TRANSVERSE_RADIUS,
  }
}
