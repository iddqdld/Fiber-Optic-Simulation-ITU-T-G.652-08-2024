import type {
  components,
  operations,
} from '../../../packages/shared_schemas/generated/api'
import { isMacrobendSequence } from './macrobend'

export type SweepBaseConfiguration =
  components['schemas']['Level1SimulationRequest']
export type SweepRequest =
  operations['sweep_level1_parameter']['requestBody']['content']['application/json']
export type SweepResult =
  operations['sweep_level1_parameter']['responses'][200]['content']['application/json']
export type SweepParameter = components['schemas']['Level1SweepParameter']

export type SweepMetricId =
  | 'numerical-aperture'
  | 'v-number'
  | 'section-loss'
  | 'output-power'
  | 'group-delay'
  | 'dispersion-broadening-fwhm'
  | 'output-pulse-fwhm'

type SweepParameterUnit = SweepResult['parameter_unit']
type SweepPoint = SweepResult['points'][number]

export type SweepParameterDefinition = {
  parameter: SweepParameter
  label: string
  unit: SweepParameterUnit
  getValue: (configuration: SweepBaseConfiguration) => number
}

export type SweepMetricDefinition = {
  id: SweepMetricId
  label: string
  unit: string
  getValue: (point: SweepPoint) => number
}

export type SweepSeriesPoint = {
  x: number
  y: number
}

export type SweepSeries = {
  points: SweepSeriesPoint[]
  xDomain: readonly [number, number]
  yDomain: readonly [number, number]
}

export type SweepRequestParseResult =
  { success: true; request: SweepRequest } | { success: false; error: string }

const SWEEP_PARAMETER_KEYS = [
  'n_core',
  'n_cladding',
  'core_radius_um',
  'attenuation_db_per_km',
  'dispersion_ps_per_nm_km',
  'group_index_dimensionless',
  'wavelength_nm',
  'input_power_dbm',
  'spectral_width_fwhm_nm',
  'input_pulse_fwhm_ps',
  'length_km',
] as const satisfies readonly SweepParameter[]

export const SWEEP_PARAMETER_DEFINITIONS: readonly SweepParameterDefinition[] =
  Object.freeze([
    {
      parameter: 'n_core',
      label: 'Core refractive index',
      unit: 'dimensionless',
      getValue: (configuration) => configuration.fibre.n_core,
    },
    {
      parameter: 'n_cladding',
      label: 'Cladding refractive index',
      unit: 'dimensionless',
      getValue: (configuration) => configuration.fibre.n_cladding,
    },
    {
      parameter: 'core_radius_um',
      label: 'Core radius',
      unit: 'µm',
      getValue: (configuration) => configuration.fibre.core_radius_um,
    },
    {
      parameter: 'attenuation_db_per_km',
      label: 'Attenuation',
      unit: 'dB/km',
      getValue: (configuration) => configuration.fibre.attenuation_db_per_km,
    },
    {
      parameter: 'dispersion_ps_per_nm_km',
      label: 'Dispersion',
      unit: 'ps/(nm·km)',
      getValue: (configuration) => configuration.fibre.dispersion_ps_per_nm_km,
    },
    {
      parameter: 'group_index_dimensionless',
      label: 'Group index',
      unit: 'dimensionless',
      getValue: (configuration) =>
        configuration.fibre.group_index_dimensionless,
    },
    {
      parameter: 'wavelength_nm',
      label: 'Wavelength',
      unit: 'nm',
      getValue: (configuration) => configuration.source.wavelength_nm,
    },
    {
      parameter: 'input_power_dbm',
      label: 'Input power',
      unit: 'dBm',
      getValue: (configuration) => configuration.source.input_power_dbm,
    },
    {
      parameter: 'spectral_width_fwhm_nm',
      label: 'Spectral width FWHM',
      unit: 'nm',
      getValue: (configuration) => configuration.source.spectral_width_fwhm_nm,
    },
    {
      parameter: 'input_pulse_fwhm_ps',
      label: 'Input pulse FWHM',
      unit: 'ps',
      getValue: (configuration) => configuration.source.input_pulse_fwhm_ps,
    },
    {
      parameter: 'length_km',
      label: 'Section length',
      unit: 'km',
      getValue: (configuration) => configuration.section.length_km,
    },
  ])

export const SWEEP_METRIC_DEFINITIONS: readonly SweepMetricDefinition[] =
  Object.freeze([
    {
      id: 'numerical-aperture',
      label: 'Numerical aperture',
      unit: 'dimensionless',
      getValue: (point) => point.numerical_aperture_dimensionless,
    },
    {
      id: 'v-number',
      label: 'V-number',
      unit: 'dimensionless',
      getValue: (point) => point.v_number_dimensionless,
    },
    {
      id: 'section-loss',
      label: 'Section loss',
      unit: 'dB',
      getValue: (point) => point.section_loss_db,
    },
    {
      id: 'output-power',
      label: 'Output power',
      unit: 'dBm',
      getValue: (point) => point.output_power_dbm,
    },
    {
      id: 'group-delay',
      label: 'Group delay',
      unit: 'ps',
      getValue: (point) => point.group_delay_ps,
    },
    {
      id: 'dispersion-broadening-fwhm',
      label: 'Dispersion broadening FWHM',
      unit: 'ps',
      getValue: (point) => point.dispersion_broadening_fwhm_ps,
    },
    {
      id: 'output-pulse-fwhm',
      label: 'Output pulse FWHM',
      unit: 'ps',
      getValue: (point) => point.output_pulse_fwhm_ps,
    },
  ])

export function getSweepParameterDefinition(
  parameter: SweepParameter,
): SweepParameterDefinition | undefined {
  return SWEEP_PARAMETER_DEFINITIONS.find(
    (definition) => definition.parameter === parameter,
  )
}

export function getSweepMetricDefinition(
  metric: SweepMetricId,
): SweepMetricDefinition | undefined {
  return SWEEP_METRIC_DEFINITIONS.find((definition) => definition.id === metric)
}

export function getCurrentSweepParameterValue(
  configuration: SweepBaseConfiguration,
  parameter: SweepParameter,
): number {
  const definition = getSweepParameterDefinition(parameter)

  if (definition === undefined) {
    throw new Error(`Unknown sweep parameter: ${String(parameter)}`)
  }

  return definition.getValue(configuration)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }

  const actualKeys = Object.keys(value)

  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isSweepParameter(value: unknown): value is SweepParameter {
  return (
    typeof value === 'string' &&
    (SWEEP_PARAMETER_KEYS as readonly string[]).includes(value)
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isSweepBaseConfiguration(
  value: unknown,
): value is SweepBaseConfiguration {
  if (
    !hasExactKeys(value, [
      'preset',
      'fibre',
      'source',
      'section',
      'sampling',
    ]) ||
    (value.preset !== 'custom' && value.preset !== 'g652d') ||
    !hasExactKeys(value.fibre, [
      'n_core',
      'n_cladding',
      'core_radius_um',
      'mode_field_radius_um',
      'attenuation_db_per_km',
      'dispersion_ps_per_nm_km',
      'group_index_dimensionless',
      'cable_application',
    ]) ||
    !hasExactKeys(value.source, [
      'wavelength_nm',
      'input_power_dbm',
      'spectral_width_fwhm_nm',
      'input_pulse_fwhm_ps',
    ]) ||
    !hasExactKeys(value.section, ['bends', 'length_km']) ||
    !hasExactKeys(value.sampling, ['grid_half_width_um', 'grid_points'])
  ) {
    return false
  }

  const fibre = value.fibre
  const source = value.source
  const section = value.section
  const sampling = value.sampling

  return (
    isFiniteNumber(fibre.n_core) &&
    isFiniteNumber(fibre.n_cladding) &&
    isFiniteNumber(fibre.core_radius_um) &&
    isFiniteNumber(fibre.mode_field_radius_um) &&
    isFiniteNumber(fibre.attenuation_db_per_km) &&
    isFiniteNumber(fibre.dispersion_ps_per_nm_km) &&
    isFiniteNumber(fibre.group_index_dimensionless) &&
    (fibre.cable_application === 'standard_cable' ||
      fibre.cable_application === 'short_jumper' ||
      fibre.cable_application === 'indoor_cable' ||
      fibre.cable_application === 'drop_cable') &&
    isFiniteNumber(source.wavelength_nm) &&
    isFiniteNumber(source.input_power_dbm) &&
    isFiniteNumber(source.spectral_width_fwhm_nm) &&
    isFiniteNumber(source.input_pulse_fwhm_ps) &&
    isFiniteNumber(section.length_km) &&
    isMacrobendSequence(section.bends) &&
    isFiniteNumber(sampling.grid_half_width_um) &&
    isFiniteNumber(sampling.grid_points)
  )
}

const SWEEP_REQUEST_KEYS = [
  'base_configuration',
  'parameter',
  'start_value',
  'stop_value',
  'sample_count',
] as const

function isSweepRequest(value: unknown): value is SweepRequest {
  if (
    !hasExactKeys(value, SWEEP_REQUEST_KEYS) ||
    !isSweepBaseConfiguration(value.base_configuration) ||
    !isSweepParameter(value.parameter) ||
    !isFiniteNumber(value.start_value) ||
    !isFiniteNumber(value.stop_value) ||
    !isFiniteNumber(value.sample_count) ||
    !Number.isInteger(value.sample_count) ||
    value.sample_count < 2 ||
    value.sample_count > 200 ||
    !(value.start_value < value.stop_value)
  ) {
    return false
  }

  return true
}

function parseFiniteSweepValue(value: string): number | null {
  if (value.trim() === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseSweepRequest(
  baseConfiguration: SweepBaseConfiguration | null,
  parameter: SweepParameter,
  startText: string,
  stopText: string,
  sampleCountText: string,
): SweepRequestParseResult {
  if (baseConfiguration === null) {
    return { success: false, error: 'a valid base configuration is required' }
  }

  const startValue = parseFiniteSweepValue(startText)
  const stopValue = parseFiniteSweepValue(stopText)

  if (startValue === null || stopValue === null) {
    return {
      success: false,
      error: 'start and stop values must be finite',
    }
  }

  if (startValue >= stopValue) {
    return {
      success: false,
      error: 'start value must be less than stop value',
    }
  }

  if (!/^[0-9]+$/.test(sampleCountText)) {
    return {
      success: false,
      error: 'sample count must be a decimal integer',
    }
  }

  const sampleCount = Number(sampleCountText)

  if (!Number.isSafeInteger(sampleCount)) {
    return {
      success: false,
      error: 'sample count must be a decimal integer',
    }
  }

  if (sampleCount < 2 || sampleCount > 200) {
    return {
      success: false,
      error: 'sample count must be between 2 and 200',
    }
  }

  return {
    success: true,
    request: {
      base_configuration: baseConfiguration,
      parameter,
      start_value: startValue,
      stop_value: stopValue,
      sample_count: sampleCount,
    },
  }
}

const SWEEP_MANIFEST_KEYS = [
  'assumptions',
  'component_model_id',
  'limitations',
  'max_sample_count',
  'model_id',
  'model_version',
  'spacing',
] as const

function isSweepManifest(value: unknown): boolean {
  return (
    hasExactKeys(value, SWEEP_MANIFEST_KEYS) &&
    isStringArray(value.assumptions) &&
    value.component_model_id === 'level1_single_section_simulation' &&
    isStringArray(value.limitations) &&
    value.max_sample_count === 200 &&
    value.model_id === 'level1_one_parameter_sweep' &&
    value.model_version === '1.0.0' &&
    value.spacing === 'linear'
  )
}

const SWEEP_POINT_KEYS = [
  'approximate_mode_count',
  'attenuation_standard_status',
  'dispersion_broadening_fwhm_ps',
  'dispersion_standard_status',
  'group_delay_ps',
  'mode_regime',
  'numerical_aperture_dimensionless',
  'output_power_dbm',
  'output_pulse_fwhm_ps',
  'parameter_value',
  'section_loss_db',
  'v_number_dimensionless',
  'warning_codes',
] as const

function isSweepPoint(value: unknown): value is SweepPoint {
  if (
    !hasExactKeys(value, SWEEP_POINT_KEYS) ||
    (value.approximate_mode_count !== null &&
      !isFiniteNumber(value.approximate_mode_count)) ||
    (value.attenuation_standard_status !== null &&
      value.attenuation_standard_status !== 'pass' &&
      value.attenuation_standard_status !== 'fail_above_maximum' &&
      value.attenuation_standard_status !== 'not_applicable') ||
    (value.dispersion_standard_status !== null &&
      value.dispersion_standard_status !== 'pass' &&
      value.dispersion_standard_status !== 'fail_below_minimum' &&
      value.dispersion_standard_status !== 'fail_above_maximum') ||
    (value.mode_regime !== 'single_mode' &&
      value.mode_regime !== 'multimode') ||
    !Array.isArray(value.warning_codes) ||
    !value.warning_codes.every(
      (code) =>
        code === 'air_acceptance_angle_unavailable' ||
        code === 'mode_count_unavailable' ||
        code === 'g652d_attenuation_not_applicable',
    )
  ) {
    return false
  }

  return (
    isFiniteNumber(value.dispersion_broadening_fwhm_ps) &&
    isFiniteNumber(value.group_delay_ps) &&
    isFiniteNumber(value.numerical_aperture_dimensionless) &&
    isFiniteNumber(value.output_power_dbm) &&
    isFiniteNumber(value.output_pulse_fwhm_ps) &&
    isFiniteNumber(value.parameter_value) &&
    isFiniteNumber(value.section_loss_db) &&
    isFiniteNumber(value.v_number_dimensionless)
  )
}

const SWEEP_RESULT_KEYS = [
  'model_manifest',
  'parameter_unit',
  'points',
  'request',
] as const

function areDeeplyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => areDeeplyEqual(item, right[index]))
    )
  }

  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) {
      return false
    }

    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) &&
          areDeeplyEqual(left[key], right[key]),
      )
    )
  }

  return false
}

export function isSweepResult(
  value: unknown,
  expectedRequest: SweepRequest,
): value is SweepResult {
  if (
    !hasExactKeys(value, SWEEP_RESULT_KEYS) ||
    !isSweepManifest(value.model_manifest) ||
    !isSweepRequest(expectedRequest) ||
    !isSweepRequest(value.request) ||
    !areDeeplyEqual(value.request, expectedRequest) ||
    !isSweepParameter(value.request.parameter) ||
    !Array.isArray(value.points) ||
    value.points.length !== expectedRequest.sample_count
  ) {
    return false
  }

  const parameterDefinition = getSweepParameterDefinition(
    expectedRequest.parameter,
  )

  if (
    parameterDefinition === undefined ||
    value.parameter_unit !== parameterDefinition.unit
  ) {
    return false
  }

  const points: SweepPoint[] = []

  for (const point of value.points) {
    if (!isSweepPoint(point)) {
      return false
    }

    points.push(point)
  }

  if (
    points[0].parameter_value !== expectedRequest.start_value ||
    points[points.length - 1].parameter_value !== expectedRequest.stop_value
  ) {
    return false
  }

  for (let index = 1; index < points.length; index += 1) {
    if (!(points[index].parameter_value > points[index - 1].parameter_value)) {
      return false
    }
  }

  return true
}

function getFirstStructuredMessage(details: unknown): string | null {
  if (!isRecord(details)) {
    return null
  }

  const candidates = [details.errors, details.detail]

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue
    }

    for (const item of candidate) {
      if (!isRecord(item)) {
        continue
      }

      const message =
        typeof item.msg === 'string'
          ? item.msg
          : typeof item.message === 'string'
            ? item.message
            : null

      if (message !== null && message.trim().length > 0) {
        return message
      }
    }
  }

  return null
}

export function getSweepErrorMessage(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) {
    return null
  }

  const structuredMessage = getFirstStructuredMessage(body.error.details)

  if (structuredMessage !== null) {
    return structuredMessage
  }

  return typeof body.error.message === 'string' &&
    body.error.message.trim().length > 0
    ? body.error.message
    : null
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value
}

function getDomain(values: readonly number[]): readonly [number, number] {
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

export function getSweepSeries(
  result: SweepResult,
  metric: SweepMetricId,
): SweepSeries {
  const definition = getSweepMetricDefinition(metric)

  if (definition === undefined) {
    throw new Error(`Unknown sweep metric: ${String(metric)}`)
  }

  const points = result.points.map((point) => ({
    x: point.parameter_value,
    y: definition.getValue(point),
  }))

  return {
    points,
    xDomain: getDomain(points.map((point) => point.x)),
    yDomain: getDomain(points.map((point) => point.y)),
  }
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

export function formatSweepNumber(value: number): string {
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
