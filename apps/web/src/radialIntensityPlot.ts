import type { ModeProfileData } from './FibreGeometryView'

export const RADIAL_INTENSITY_VIEW_BOX = '0 0 720 420'

export const RADIAL_INTENSITY_SVG = {
  width: 720,
  height: 420,
  plotLeft: 76,
  plotTop: 24,
  plotWidth: 614,
  plotHeight: 316,
} as const

export const RADIAL_INTENSITY_MODEL_ID = 'gaussian_lp01_mode_profile'
export const RADIAL_INTENSITY_MODEL_VERSION = '1.0.0'
export const RADIAL_INTENSITY_NORMALIZATION =
  'unit_peak_field_and_intensity' as const
export const RADIAL_INTENSITY_RADIUS_CONVENTION = '1/e_field_radius' as const

export type RadialIntensitySamples = {
  modeFieldRadiusUm: number
  gridHalfWidthUm: number
  gridPoints: number
  modelId: string
  modelVersion: string
  normalizationConvention: typeof RADIAL_INTENSITY_NORMALIZATION
  radiusConvention: typeof RADIAL_INTENSITY_RADIUS_CONVENTION
  radii: number[]
  intensities: number[]
}

export type SvgRadialPoint = {
  radiusUm: number
  intensity: number
  x: number
  y: number
}

export type SvgRadialMapping = {
  points: SvgRadialPoint[]
  xDomain: readonly [number, number]
  yDomain: readonly [number, number]
  suppliedRadiusMarker: {
    radiusUm: number
    x: number
  } | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasStrictlyIncreasingAxis(axis: number[]): boolean {
  for (let index = 1; index < axis.length; index += 1) {
    if (!(axis[index] > axis[index - 1])) {
      return false
    }
  }

  return true
}

export function isValidRadialModeProfile(
  profile: ModeProfileData | null | undefined,
): profile is ModeProfileData {
  if (
    profile === null ||
    profile === undefined ||
    typeof profile !== 'object' ||
    !isFiniteNumber(profile.modeFieldRadiusUm) ||
    profile.modeFieldRadiusUm <= 0 ||
    !isFiniteNumber(profile.gridHalfWidthUm) ||
    profile.gridHalfWidthUm <= 0 ||
    !Number.isSafeInteger(profile.gridPoints) ||
    profile.gridPoints < 3 ||
    profile.gridPoints > 65 ||
    profile.gridPoints % 2 === 0 ||
    !Array.isArray(profile.xUm) ||
    !Array.isArray(profile.yUm) ||
    !Array.isArray(profile.normalizedIntensity) ||
    profile.xUm.length !== profile.gridPoints ||
    profile.yUm.length !== profile.gridPoints ||
    profile.normalizedIntensity.length !== profile.gridPoints ||
    profile.modelId !== RADIAL_INTENSITY_MODEL_ID ||
    profile.modelVersion !== RADIAL_INTENSITY_MODEL_VERSION ||
    profile.normalizationConvention !== RADIAL_INTENSITY_NORMALIZATION ||
    profile.radiusConvention !== RADIAL_INTENSITY_RADIUS_CONVENTION
  ) {
    return false
  }

  for (let index = 0; index < profile.gridPoints; index += 1) {
    const x = profile.xUm[index]
    const y = profile.yUm[index]
    const intensityRow = profile.normalizedIntensity[index]

    if (
      !isFiniteNumber(x) ||
      !isFiniteNumber(y) ||
      x !== y ||
      !Array.isArray(intensityRow) ||
      intensityRow.length !== profile.gridPoints
    ) {
      return false
    }

    for (
      let columnIndex = 0;
      columnIndex < profile.gridPoints;
      columnIndex += 1
    ) {
      const intensity = intensityRow[columnIndex]

      if (!isFiniteNumber(intensity) || intensity < 0 || intensity > 1) {
        return false
      }
    }
  }

  const centerIndex = (profile.gridPoints - 1) / 2
  const xAxis = profile.xUm
  const yAxis = profile.yUm

  return (
    hasStrictlyIncreasingAxis(xAxis) &&
    hasStrictlyIncreasingAxis(yAxis) &&
    xAxis[0] === -profile.gridHalfWidthUm &&
    xAxis[xAxis.length - 1] === profile.gridHalfWidthUm &&
    yAxis[0] === -profile.gridHalfWidthUm &&
    yAxis[yAxis.length - 1] === profile.gridHalfWidthUm &&
    xAxis[centerIndex] === 0 &&
    yAxis[centerIndex] === 0 &&
    profile.normalizedIntensity[centerIndex][centerIndex] === 1
  )
}

export function extractPositiveRadialSamples(
  profile: ModeProfileData | null | undefined,
): RadialIntensitySamples | null {
  if (!isValidRadialModeProfile(profile)) {
    return null
  }

  const centerIndex = (profile.gridPoints - 1) / 2

  return {
    modeFieldRadiusUm: profile.modeFieldRadiusUm,
    gridHalfWidthUm: profile.gridHalfWidthUm,
    gridPoints: profile.gridPoints,
    modelId: profile.modelId,
    modelVersion: profile.modelVersion,
    normalizationConvention: profile.normalizationConvention,
    radiusConvention: profile.radiusConvention,
    radii: profile.xUm.slice(centerIndex),
    intensities: profile.normalizedIntensity[centerIndex].slice(centerIndex),
  }
}

export function mapRadialIntensityToSvg(
  samples: RadialIntensitySamples,
): SvgRadialMapping {
  const radiusStart = samples.radii[0]
  const radiusEnd = samples.radii[samples.radii.length - 1]
  const radiusSpan = radiusEnd - radiusStart
  const xDomain: readonly [number, number] = [radiusStart, radiusEnd]
  const yDomain: readonly [number, number] = [0, 1]
  const points = samples.radii.map((radiusUm, index) => ({
    radiusUm,
    intensity: samples.intensities[index],
    x:
      RADIAL_INTENSITY_SVG.plotLeft +
      ((radiusUm - radiusStart) / radiusSpan) * RADIAL_INTENSITY_SVG.plotWidth,
    y:
      RADIAL_INTENSITY_SVG.plotTop +
      (1 - samples.intensities[index]) * RADIAL_INTENSITY_SVG.plotHeight,
  }))

  const hasSuppliedRadiusMarker =
    samples.modeFieldRadiusUm >= radiusStart &&
    samples.modeFieldRadiusUm <= radiusEnd

  return {
    points,
    xDomain,
    yDomain,
    suppliedRadiusMarker: hasSuppliedRadiusMarker
      ? {
          radiusUm: samples.modeFieldRadiusUm,
          x:
            RADIAL_INTENSITY_SVG.plotLeft +
            ((samples.modeFieldRadiusUm - radiusStart) / radiusSpan) *
              RADIAL_INTENSITY_SVG.plotWidth,
        }
      : null,
  }
}

export function getRadialIntensityPlotData(
  profile: ModeProfileData | null | undefined,
): (RadialIntensitySamples & { svg: SvgRadialMapping }) | null {
  const samples = extractPositiveRadialSamples(profile)

  if (samples === null) {
    return null
  }

  return {
    ...samples,
    svg: mapRadialIntensityToSvg(samples),
  }
}
