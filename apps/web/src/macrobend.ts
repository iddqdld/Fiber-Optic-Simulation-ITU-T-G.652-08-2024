import type { components } from '../../../packages/shared_schemas/generated/api'

type MacrobendInput = components['schemas']['MacrobendInput']
export type MacrobendLossResult = components['schemas']['MacrobendLossResult']

const DB_PER_NEPER_POWER = 10 / Math.log(10)
const FLOAT_TOLERANCE = 1e-9

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function approximatelyEqual(left: number, right: number): boolean {
  return (
    Math.abs(left - right) <=
    FLOAT_TOLERANCE * Math.max(1, Math.abs(left), Math.abs(right))
  )
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isValidity(
  value: unknown,
): value is components['schemas']['MarcuseModelValidity'] {
  return (
    value === 'valid' ||
    value === 'warning' ||
    value === 'outside_model_validity'
  )
}

function isMacrobendInput(value: unknown): value is MacrobendInput {
  return (
    (hasExactKeys(value, ['angle_deg', 'position_fraction', 'radius_mm']) ||
      hasExactKeys(value, [
        'angle_deg',
        'direction',
        'position_fraction',
        'radius_mm',
      ])) &&
    (value.direction === undefined ||
      value.direction === 'left' ||
      value.direction === 'right') &&
    isFiniteNumber(value.position_fraction) &&
    value.position_fraction >= 0 &&
    value.position_fraction <= 1 &&
    isPositiveFiniteNumber(value.radius_mm) &&
    isPositiveFiniteNumber(value.angle_deg) &&
    value.angle_deg <= 360
  )
}

export function isMacrobendSequence(value: unknown): value is MacrobendInput[] {
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    !value.every(isMacrobendInput)
  ) {
    return false
  }

  return value.every(
    (bend, index) =>
      index === 0 ||
      value[index - 1].position_fraction < bend.position_fraction,
  )
}

export function macrobendInputsMatch(
  left: readonly MacrobendInput[],
  right: readonly MacrobendInput[],
): boolean {
  return (
    left.length === right.length &&
    left.every((bend, index) => {
      const other = right[index]
      return (
        bend.position_fraction === other.position_fraction &&
        bend.radius_mm === other.radius_mm &&
        bend.angle_deg === other.angle_deg &&
        (bend.direction ?? 'left') === (other.direction ?? 'left')
      )
    })
  )
}

function isMacrobendLossPoint(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.position_fraction) ||
    value.position_fraction < 0 ||
    value.position_fraction > 1 ||
    !isPositiveFiniteNumber(value.radius_mm) ||
    !isPositiveFiniteNumber(value.angle_deg) ||
    value.angle_deg > 360 ||
    (value.direction !== 'left' && value.direction !== 'right') ||
    !isPositiveFiniteNumber(value.bend_length_m) ||
    !isNonNegativeFiniteNumber(value.alpha_power_per_m) ||
    !isNonNegativeFiniteNumber(value.local_loss_db_per_m) ||
    !isNonNegativeFiniteNumber(value.estimated_radiation_loss_db) ||
    !isNonNegativeFiniteNumber(value.cumulative_bend_loss_db) ||
    !isFiniteNumber(value.output_power_dbm) ||
    !isValidity(value.validity) ||
    typeof value.numerical_underflow !== 'boolean' ||
    !isStringArray(value.warnings)
  ) {
    return false
  }

  const expectedLength =
    value.radius_mm * 1e-3 * ((value.angle_deg * Math.PI) / 180)
  return (
    approximatelyEqual(value.bend_length_m, expectedLength) &&
    approximatelyEqual(
      value.local_loss_db_per_m,
      DB_PER_NEPER_POWER * value.alpha_power_per_m,
    ) &&
    approximatelyEqual(
      value.estimated_radiation_loss_db,
      value.local_loss_db_per_m * value.bend_length_m,
    )
  )
}

function isManifest(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.model_id === 'marcuse_lp01_step_index_macrobend' &&
    value.model_version === '1.0.0' &&
    value.scientific_label ===
      'Estimated LP01 macrobend radiation loss — Marcuse model' &&
    value.loss_source === 'calculated' &&
    value.path_model === 'piecewise_constant_curvature' &&
    isStringArray(value.assumptions) &&
    isStringArray(value.limitations) &&
    isStringArray(value.references)
  )
}

export function isMacrobendLossResult(
  value: unknown,
): value is MacrobendLossResult {
  if (
    !isRecord(value) ||
    !isPositiveFiniteNumber(value.wavelength_m) ||
    !isPositiveFiniteNumber(value.core_radius_m) ||
    !(
      value.cladding_radius_m === null ||
      isPositiveFiniteNumber(value.cladding_radius_m)
    ) ||
    !isPositiveFiniteNumber(value.n_core) ||
    !isPositiveFiniteNumber(value.n_cladding) ||
    value.n_core <= value.n_cladding ||
    !(value.beta_per_m === null || isPositiveFiniteNumber(value.beta_per_m)) ||
    !(
      value.beta_source === null ||
      value.beta_source === 'existing_effective_index' ||
      value.beta_source === 'scalar_step_index_lp01'
    ) ||
    !isFiniteNumber(value.input_power_dbm) ||
    !isNonNegativeFiniteNumber(value.total_bent_length_m) ||
    !(
      value.minimum_bend_radius_m === null ||
      isPositiveFiniteNumber(value.minimum_bend_radius_m)
    ) ||
    !isNonNegativeFiniteNumber(value.max_local_loss_db_per_m) ||
    !isNonNegativeFiniteNumber(value.total_bend_loss_db) ||
    !isFiniteNumber(value.output_power_dbm) ||
    value.output_power_dbm > value.input_power_dbm ||
    !isValidity(value.validity) ||
    typeof value.numerical_underflow !== 'boolean' ||
    !isStringArray(value.warnings) ||
    !Array.isArray(value.bends) ||
    value.bends.length > 32 ||
    !value.bends.every(isMacrobendLossPoint) ||
    !isManifest(value.model_manifest)
  ) {
    return false
  }

  const k0PerM = (2 * Math.PI) / value.wavelength_m
  if (
    (value.cladding_radius_m !== null &&
      value.core_radius_m >= value.cladding_radius_m) ||
    (value.beta_per_m !== null &&
      (value.beta_per_m <= value.n_cladding * k0PerM ||
        value.beta_per_m >= value.n_core * k0PerM)) ||
    (value.bends.length > 0 &&
      (value.beta_per_m === null || value.beta_source === null)) ||
    (value.beta_per_m === null) !== (value.beta_source === null)
  ) {
    return false
  }

  let cumulativeLossDb = 0
  let totalLengthM = 0
  let maximumLocalLossDbPerM = 0
  for (let index = 0; index < value.bends.length; index += 1) {
    const current = value.bends[index]
    cumulativeLossDb += current.estimated_radiation_loss_db
    totalLengthM += current.bend_length_m
    maximumLocalLossDbPerM = Math.max(
      maximumLocalLossDbPerM,
      current.local_loss_db_per_m,
    )
    if (
      (index > 0 &&
        value.bends[index - 1].position_fraction >=
          current.position_fraction) ||
      !approximatelyEqual(current.cumulative_bend_loss_db, cumulativeLossDb) ||
      !approximatelyEqual(
        current.output_power_dbm,
        value.input_power_dbm - cumulativeLossDb,
      )
    ) {
      return false
    }
  }

  if (value.bends.length === 0) {
    return (
      value.total_bent_length_m === 0 &&
      value.minimum_bend_radius_m === null &&
      value.max_local_loss_db_per_m === 0 &&
      value.total_bend_loss_db === 0 &&
      value.output_power_dbm === value.input_power_dbm
    )
  }

  return (
    approximatelyEqual(value.total_bent_length_m, totalLengthM) &&
    approximatelyEqual(
      value.minimum_bend_radius_m as number,
      Math.min(...value.bends.map((bend) => bend.radius_mm * 1e-3)),
    ) &&
    approximatelyEqual(value.max_local_loss_db_per_m, maximumLocalLossDbPerM) &&
    approximatelyEqual(value.total_bend_loss_db, cumulativeLossDb) &&
    approximatelyEqual(
      value.output_power_dbm,
      value.input_power_dbm - cumulativeLossDb,
    )
  )
}
