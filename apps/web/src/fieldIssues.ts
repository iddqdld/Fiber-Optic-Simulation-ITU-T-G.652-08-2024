import type { operations } from '../../../packages/shared_schemas/generated/api'

import type { FormValues, NumericFormField } from './Level1Form'

type PreviewResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']

export type FieldIssueTone = 'warning' | 'error'

export type FieldIssue = {
  tone: FieldIssueTone
  message: string
}

export type FieldIssueField = NumericFormField | 'cable_application'

export type FieldIssues = Partial<
  Record<FieldIssueField, readonly FieldIssue[]>
>

const NUMERIC_FIELDS: readonly NumericFormField[] = [
  'n_core',
  'n_cladding',
  'core_radius_um',
  'mode_field_radius_um',
  'attenuation_db_per_km',
  'dispersion_ps_per_nm_km',
  'group_index_dimensionless',
  'wavelength_nm',
  'input_power_dbm',
  'spectral_width_fwhm_nm',
  'input_pulse_fwhm_ps',
  'length_km',
  'grid_half_width_um',
  'grid_points',
]

const STRICTLY_POSITIVE_FIELDS: readonly NumericFormField[] = [
  'n_core',
  'n_cladding',
  'core_radius_um',
  'mode_field_radius_um',
  'group_index_dimensionless',
  'wavelength_nm',
  'input_pulse_fwhm_ps',
  'grid_half_width_um',
]

const NONNEGATIVE_FIELDS: readonly NumericFormField[] = [
  'attenuation_db_per_km',
  'spectral_width_fwhm_nm',
  'length_km',
]

const G652D_MIN_WAVELENGTH_NM = 1260
const G652D_MAX_WAVELENGTH_NM = 1625
const DIRECT_ATTENUATION_MIN_WAVELENGTH_NM = 1310
const DIRECT_ATTENUATION_MAX_WAVELENGTH_NM = 1625

type MutableFieldIssues = Partial<Record<FieldIssueField, FieldIssue[]>>

function addIssue(
  issues: MutableFieldIssues,
  field: FieldIssueField,
  issue: FieldIssue,
): void {
  const fieldIssues = issues[field] ?? []

  if (
    !fieldIssues.some(
      (existing) =>
        existing.tone === issue.tone && existing.message === issue.message,
    )
  ) {
    fieldIssues.push(issue)
  }

  issues[field] = fieldIssues
}

function addError(
  issues: MutableFieldIssues,
  field: FieldIssueField,
  message: string,
): void {
  addIssue(issues, field, { tone: 'error', message })
}

function addWarning(
  issues: MutableFieldIssues,
  field: FieldIssueField,
  message: string,
): void {
  addIssue(issues, field, { tone: 'warning', message })
}

function parseFiniteValues(
  values: FormValues,
  issues: MutableFieldIssues,
): Partial<Record<NumericFormField, number>> {
  const parsed: Partial<Record<NumericFormField, number>> = {}

  for (const field of NUMERIC_FIELDS) {
    const rawValue = values[field]
    const value = Number(rawValue)

    if (rawValue.trim() === '' || !Number.isFinite(value)) {
      addError(issues, field, 'Must be a finite number.')
      continue
    }

    parsed[field] = value
  }

  return parsed
}

function addLocalIssues(values: FormValues, issues: MutableFieldIssues): void {
  const parsed = parseFiniteValues(values, issues)

  for (const field of STRICTLY_POSITIVE_FIELDS) {
    const value = parsed[field]

    if (value !== undefined && value <= 0) {
      addError(issues, field, 'Must be greater than 0.')
    }
  }

  for (const field of NONNEGATIVE_FIELDS) {
    const value = parsed[field]

    if (value !== undefined && value < 0) {
      addError(issues, field, 'Must be at least 0.')
    }
  }

  const nCore = parsed.n_core
  const nCladding = parsed.n_cladding

  if (nCore !== undefined && nCladding !== undefined && nCore <= nCladding) {
    const message = 'Must satisfy n_core > n_cladding.'
    addError(issues, 'n_core', message)
    addError(issues, 'n_cladding', message)
  }

  const gridPoints = parsed.grid_points

  if (
    gridPoints !== undefined &&
    (!Number.isInteger(gridPoints) ||
      gridPoints < 3 ||
      gridPoints > 65 ||
      gridPoints % 2 === 0)
  ) {
    addError(issues, 'grid_points', 'Must be an odd integer from 3 to 65.')
  }

  const wavelength = parsed.wavelength_nm

  if (
    values.preset === 'g652d' &&
    wavelength !== undefined &&
    (wavelength < G652D_MIN_WAVELENGTH_NM ||
      wavelength > G652D_MAX_WAVELENGTH_NM)
  ) {
    addError(
      issues,
      'wavelength_nm',
      `G.652.D wavelength must be between ${G652D_MIN_WAVELENGTH_NM} and ${G652D_MAX_WAVELENGTH_NM} nm.`,
    )
  }
}

function addBackendIssues(
  values: FormValues,
  result: PreviewResult,
  issues: MutableFieldIssues,
): void {
  const standardsChecks = result.standards_checks

  if (standardsChecks.preset !== 'g652d') {
    return
  }

  const attenuation = standardsChecks.attenuation

  if (attenuation !== null) {
    if (
      attenuation.status === 'fail_above_maximum' &&
      attenuation.maximum_attenuation_db_per_km !== null
    ) {
      addError(
        issues,
        'attenuation_db_per_km',
        `G.652.D attenuation must be <= ${attenuation.maximum_attenuation_db_per_km} dB/km at ${attenuation.wavelength_nm} nm.`,
      )
    }

    if (
      attenuation.status === 'not_applicable' &&
      attenuation.not_applicable_reason !== null
    ) {
      if (values.cable_application !== 'standard_cable') {
        addWarning(
          issues,
          'cable_application',
          attenuation.not_applicable_reason,
        )
      } else {
        addWarning(
          issues,
          'wavelength_nm',
          `G.652.D direct attenuation range is ${DIRECT_ATTENUATION_MIN_WAVELENGTH_NM}–${DIRECT_ATTENUATION_MAX_WAVELENGTH_NM} nm; ${attenuation.not_applicable_reason}`,
        )
      }
    }
  }

  const dispersion = standardsChecks.dispersion

  if (
    dispersion !== null &&
    (dispersion.status === 'fail_below_minimum' ||
      dispersion.status === 'fail_above_maximum')
  ) {
    addError(
      issues,
      'dispersion_ps_per_nm_km',
      `G.652.D dispersion must be between ${dispersion.minimum_dispersion_ps_per_nm_km} and ${dispersion.maximum_dispersion_ps_per_nm_km} ps/(nm·km) at ${dispersion.wavelength_nm} nm.`,
    )
  }
}

export function getFieldIssues(
  values: FormValues,
  result: PreviewResult | null,
): FieldIssues {
  const issues: MutableFieldIssues = {}

  addLocalIssues(values, issues)

  if (result !== null) {
    addBackendIssues(values, result, issues)
  }

  return issues
}
