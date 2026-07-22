import type { operations } from '../../../packages/shared_schemas/generated/api'

export type ComparisonResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']

export type ComparisonMetric = {
  id: string
  label: string
  unit: string
  baselineValue: number
  variantValue: number
  delta: number
}

export type ComparisonParameterDifference = {
  field: string
  label: string
  unit: string | null
  baselineValue: string
  variantValue: string
  delta: number | null
}

export type ComparisonSeriesPoint = {
  x: number
  y: number
}

export type ComparisonSeries = {
  baseline: ComparisonSeriesPoint[]
  variant: ComparisonSeriesPoint[]
  xDomain: readonly [number, number]
  yDomain: readonly [number, number]
}

type ComparisonConfiguration = ComparisonResult['configuration']

type MetricDefinition = {
  id: string
  label: string
  unit: string
  getValue: (result: ComparisonResult) => number
}

const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    id: 'v-number',
    label: 'V-number',
    unit: 'dimensionless',
    getValue: (result) => result.guidance.v_number_dimensionless,
  },
  {
    id: 'numerical-aperture',
    label: 'Numerical aperture',
    unit: 'dimensionless',
    getValue: (result) => result.guidance.numerical_aperture_dimensionless,
  },
  {
    id: 'section-loss',
    label: 'Section loss',
    unit: 'dB',
    getValue: (result) => result.attenuation.section_loss_db,
  },
  {
    id: 'output-power',
    label: 'Output power',
    unit: 'dBm',
    getValue: (result) => result.attenuation.output_power_dbm,
  },
  {
    id: 'group-delay',
    label: 'Group delay',
    unit: 'ps',
    getValue: (result) => result.group_delay.group_delay_ps,
  },
  {
    id: 'dispersion-broadening-fwhm',
    label: 'Dispersion broadening FWHM',
    unit: 'ps',
    getValue: (result) => result.pulse_broadening.dispersion_broadening_fwhm_ps,
  },
  {
    id: 'output-pulse-fwhm',
    label: 'Output pulse FWHM',
    unit: 'ps',
    getValue: (result) => result.pulse_broadening.output_pulse_fwhm_ps,
  },
]

type ParameterDefinition = {
  field: string
  label: string
  unit: string | null
  numeric: boolean
  getValue: (configuration: ComparisonConfiguration) => number | string
}

const PARAMETER_DEFINITIONS: readonly ParameterDefinition[] = [
  {
    field: 'preset',
    label: 'Fibre preset',
    unit: null,
    numeric: false,
    getValue: (configuration) => configuration.preset,
  },
  {
    field: 'fibre.n_core',
    label: 'Core refractive index',
    unit: 'dimensionless',
    numeric: true,
    getValue: (configuration) => configuration.fibre.n_core,
  },
  {
    field: 'fibre.n_cladding',
    label: 'Cladding refractive index',
    unit: 'dimensionless',
    numeric: true,
    getValue: (configuration) => configuration.fibre.n_cladding,
  },
  {
    field: 'fibre.core_radius_um',
    label: 'Core radius',
    unit: 'µm',
    numeric: true,
    getValue: (configuration) => configuration.fibre.core_radius_um,
  },
  {
    field: 'fibre.mode_field_radius_um',
    label: 'Mode-field radius',
    unit: 'µm',
    numeric: true,
    getValue: (configuration) => configuration.fibre.mode_field_radius_um,
  },
  {
    field: 'fibre.group_index_dimensionless',
    label: 'Group index',
    unit: 'dimensionless',
    numeric: true,
    getValue: (configuration) => configuration.fibre.group_index_dimensionless,
  },
  {
    field: 'fibre.attenuation_db_per_km',
    label: 'Attenuation',
    unit: 'dB/km',
    numeric: true,
    getValue: (configuration) => configuration.fibre.attenuation_db_per_km,
  },
  {
    field: 'fibre.dispersion_ps_per_nm_km',
    label: 'Dispersion',
    unit: 'ps/(nm·km)',
    numeric: true,
    getValue: (configuration) => configuration.fibre.dispersion_ps_per_nm_km,
  },
  {
    field: 'fibre.cable_application',
    label: 'Cable application',
    unit: null,
    numeric: false,
    getValue: (configuration) => configuration.fibre.cable_application,
  },
  {
    field: 'source.wavelength_nm',
    label: 'Wavelength',
    unit: 'nm',
    numeric: true,
    getValue: (configuration) => configuration.source.wavelength_nm,
  },
  {
    field: 'source.input_power_dbm',
    label: 'Input power',
    unit: 'dBm',
    numeric: true,
    getValue: (configuration) => configuration.source.input_power_dbm,
  },
  {
    field: 'source.spectral_width_fwhm_nm',
    label: 'Spectral width FWHM',
    unit: 'nm',
    numeric: true,
    getValue: (configuration) => configuration.source.spectral_width_fwhm_nm,
  },
  {
    field: 'source.input_pulse_fwhm_ps',
    label: 'Input pulse FWHM',
    unit: 'ps',
    numeric: true,
    getValue: (configuration) => configuration.source.input_pulse_fwhm_ps,
  },
  {
    field: 'section.length_km',
    label: 'Section length',
    unit: 'km',
    numeric: true,
    getValue: (configuration) => configuration.section.length_km,
  },
  {
    field: 'sampling.grid_half_width_um',
    label: 'Grid half-width',
    unit: 'µm',
    numeric: true,
    getValue: (configuration) => configuration.sampling.grid_half_width_um,
  },
  {
    field: 'sampling.grid_points',
    label: 'Grid points',
    unit: 'count',
    numeric: true,
    getValue: (configuration) => configuration.sampling.grid_points,
  },
]

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value
}

function getDelta(baselineValue: number, variantValue: number): number {
  return normalizeZero(variantValue - baselineValue)
}

function trimNumber(value: string): string {
  const [mantissa, exponent] = value.split('e')
  const trimmedMantissa = mantissa
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '')

  return exponent === undefined
    ? trimmedMantissa
    : `${trimmedMantissa}e${exponent}`
}

export function formatComparisonNumber(value: number): string {
  if (value === 0) {
    return '0'
  }

  if (!Number.isFinite(value)) {
    return String(value)
  }

  const absoluteValue = Math.abs(value)
  const formatted =
    absoluteValue >= 1e6 || absoluteValue < 1e-4
      ? value.toExponential(5)
      : value.toPrecision(6)

  return trimNumber(formatted)
}

export function getComparisonMetrics(
  baseline: ComparisonResult,
  variant: ComparisonResult,
): ComparisonMetric[] {
  return METRIC_DEFINITIONS.map((definition) => {
    const baselineValue = definition.getValue(baseline)
    const variantValue = definition.getValue(variant)

    return {
      id: definition.id,
      label: definition.label,
      unit: definition.unit,
      baselineValue,
      variantValue,
      delta: getDelta(baselineValue, variantValue),
    }
  })
}

export function getParameterDifferences(
  baseline: ComparisonConfiguration,
  variant: ComparisonConfiguration,
): ComparisonParameterDifference[] {
  return PARAMETER_DEFINITIONS.flatMap((definition) => {
    const baselineValue = definition.getValue(baseline)
    const variantValue = definition.getValue(variant)

    if (baselineValue === variantValue) {
      return []
    }

    const numericBaselineValue = definition.numeric
      ? (baselineValue as number)
      : null
    const numericVariantValue = definition.numeric
      ? (variantValue as number)
      : null

    return [
      {
        field: definition.field,
        label: definition.label,
        unit: definition.unit,
        baselineValue:
          numericBaselineValue === null
            ? String(baselineValue)
            : formatComparisonNumber(numericBaselineValue),
        variantValue:
          numericVariantValue === null
            ? String(variantValue)
            : formatComparisonNumber(numericVariantValue),
        delta:
          numericBaselineValue === null || numericVariantValue === null
            ? null
            : getDelta(numericBaselineValue, numericVariantValue),
      },
    ]
  })
}

function getSeriesPoints(
  xValues: readonly number[],
  yValues: readonly number[],
): ComparisonSeriesPoint[] {
  return xValues.map((x, index) => ({ x, y: yValues[index] }))
}

function getSharedDomain(values: readonly number[]): readonly [number, number] {
  if (values.length === 0) {
    return [0, 0]
  }

  let minimum = values[0]
  let maximum = values[0]

  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]

    if (value < minimum) {
      minimum = value
    }

    if (value > maximum) {
      maximum = value
    }
  }

  return [normalizeZero(minimum), normalizeZero(maximum)]
}

export function getPowerComparisonSeries(
  baseline: ComparisonResult,
  variant: ComparisonResult,
): ComparisonSeries {
  const baselineDistance = baseline.attenuation.distance_samples_km
  const baselinePower = baseline.attenuation.power_samples_dbm
  const variantDistance = variant.attenuation.distance_samples_km
  const variantPower = variant.attenuation.power_samples_dbm

  return {
    baseline: getSeriesPoints(baselineDistance, baselinePower),
    variant: getSeriesPoints(variantDistance, variantPower),
    xDomain: getSharedDomain([...baselineDistance, ...variantDistance]),
    yDomain: getSharedDomain([...baselinePower, ...variantPower]),
  }
}

function getRadialPoints(
  profile: ComparisonResult['mode_profile'],
): ComparisonSeriesPoint[] {
  const zeroRowIndex = profile.y_um.findIndex((value) => value === 0)
  const zeroRow = profile.normalized_intensity[zeroRowIndex]

  return profile.x_um.flatMap((radius, index) =>
    radius >= 0 ? [{ x: radius, y: zeroRow[index] }] : [],
  )
}

export function getRadialComparisonSeries(
  baseline: ComparisonResult,
  variant: ComparisonResult,
): ComparisonSeries {
  const baselinePoints = getRadialPoints(baseline.mode_profile)
  const variantPoints = getRadialPoints(variant.mode_profile)
  const radii = [
    ...baselinePoints.map((point) => point.x),
    ...variantPoints.map((point) => point.x),
  ]

  return {
    baseline: baselinePoints,
    variant: variantPoints,
    xDomain: [0, radii.length === 0 ? 0 : Math.max(...radii)],
    yDomain: [0, 1],
  }
}
