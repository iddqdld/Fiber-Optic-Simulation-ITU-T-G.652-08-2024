/** Ideal circular step-index LP11 cutoff (Saleh & Teich §8.1C / Table 8.1-1). */
export const MODE_REGIME_CUTOFF_V = 2.405

export type ModeRegimeId = 'single_mode' | 'multimode'

export type ModeRegimeSummary = {
  modeRegime: ModeRegimeId
  vNumber: number
  cutoffV: number
  approximateModeCount: number | null
  numericalAperture: number | null
  criticalAngleDeg: number | null
  modelId: string
  modelVersion: string
}

export type SupportedModeId = 'LP01' | 'LP11' | 'LP21' | 'LP02'

export type SupportedMode = {
  id: SupportedModeId
  label: string
  cutoffV: number
  /** True when V is at or above the ideal cutoff for this family. */
  supported: boolean
  /** Educational schematic only — not a launched/excited mode prediction. */
  schematic: true
}

/**
 * Ideal step-index cutoff ladder used for educational multimode support lists.
 * Values follow the conventional LP cutoff sequence near Table 8.1-1.
 */
export const SUPPORTED_MODE_CUTOFFS: ReadonlyArray<{
  id: SupportedModeId
  label: string
  cutoffV: number
}> = [
  { id: 'LP01', label: 'LP01 (fundamental)', cutoffV: 0 },
  { id: 'LP11', label: 'LP11', cutoffV: MODE_REGIME_CUTOFF_V },
  { id: 'LP21', label: 'LP21', cutoffV: 3.832 },
  { id: 'LP02', label: 'LP02', cutoffV: 3.832 },
]

export function isValidModeRegimeSummary(
  value: ModeRegimeSummary | null | undefined,
): value is ModeRegimeSummary {
  return (
    value !== null &&
    value !== undefined &&
    (value.modeRegime === 'single_mode' || value.modeRegime === 'multimode') &&
    Number.isFinite(value.vNumber) &&
    value.vNumber >= 0 &&
    Number.isFinite(value.cutoffV) &&
    value.cutoffV > 0 &&
    (value.approximateModeCount === null ||
      (Number.isFinite(value.approximateModeCount) &&
        value.approximateModeCount >= 0)) &&
    (value.numericalAperture === null ||
      (Number.isFinite(value.numericalAperture) &&
        value.numericalAperture >= 0)) &&
    (value.criticalAngleDeg === null ||
      (Number.isFinite(value.criticalAngleDeg) &&
        value.criticalAngleDeg > 0 &&
        value.criticalAngleDeg < 90)) &&
    typeof value.modelId === 'string' &&
    value.modelId.trim().length > 0 &&
    typeof value.modelVersion === 'string' &&
    value.modelVersion.trim().length > 0
  )
}

export function listSupportedModes(vNumber: number): SupportedMode[] {
  if (!Number.isFinite(vNumber) || vNumber < 0) {
    return []
  }

  return SUPPORTED_MODE_CUTOFFS.map((mode) => ({
    ...mode,
    supported: vNumber >= mode.cutoffV,
    schematic: true as const,
  }))
}

export function formatModeRegimeLabel(regime: ModeRegimeId): string {
  return regime === 'single_mode' ? 'Single-mode' : 'Multimode'
}

/**
 * Educational intensity pattern on a unit disk for schematic higher-order modes.
 * Not a Maxwell / vector mode solver.
 */
export function schematicModeIntensity(
  modeId: SupportedModeId,
  x: number,
  y: number,
  modeFieldRadius: number,
): number {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(modeFieldRadius) ||
    modeFieldRadius <= 0
  ) {
    return 0
  }

  const r = Math.hypot(x, y) / modeFieldRadius
  const phi = Math.atan2(y, x)
  const envelope = Math.exp(-(r * r))

  if (modeId === 'LP01') {
    return envelope * envelope
  }

  if (modeId === 'LP11') {
    const amplitude = r * Math.cos(phi) * envelope
    return amplitude * amplitude
  }

  if (modeId === 'LP21') {
    const amplitude = r * r * Math.cos(2 * phi) * envelope
    return amplitude * amplitude
  }

  // LP02: central peak with a radial ring (schematic)
  const amplitude = (1 - r * r) * envelope
  return amplitude * amplitude
}
