import type { components } from '../../../packages/shared_schemas/generated/api'

export type ScalarLPModeCatalog =
  components['schemas']['ScalarLPModeCatalogResult']
export type ScalarLPModeFamily =
  components['schemas']['ScalarLPModeFamilyResult']
export type ScalarLPModeFieldResult =
  components['schemas']['ScalarLPModeFieldResult']
export type ScalarLPModeFieldRequest =
  components['schemas']['ScalarLPModeFieldRequest']

export type ScalarModeFieldData = {
  coreRadiusUm: number
  gridHalfWidthUm: number
  gridPoints: number
  xUm: number[]
  yUm: number[]
  normalizedField: number[][]
  normalizedIntensity: number[][]
  selectedMode: ScalarLPModeFamily
  modelId: 'scalar_lp_step_index_modes'
  modelVersion: '1.0.0'
  fieldLabel: 'Scalar LP mode field — weak-guidance step-index model'
  normalizationConvention: 'unit_peak_absolute_field'
  angularBasis: 'cosine_representative'
  excitationStatus: 'not_calculated'
}

const MAX_MODE_FAMILIES = 16
const MIN_GRID_POINTS = 3
const MAX_GRID_POINTS = 65

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function approximatelyEqual(left: number, right: number): boolean {
  return (
    Math.abs(left - right) <=
    1e-9 * Math.max(1, Math.abs(left), Math.abs(right))
  )
}

function opticalVNumber(
  wavelengthM: number,
  coreRadiusM: number,
  nCore: number,
  nCladding: number,
): number {
  return (
    ((2 * Math.PI) / wavelengthM) *
    coreRadiusM *
    Math.sqrt(nCore ** 2 - nCladding ** 2)
  )
}

function isManifest(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.model_id === 'scalar_lp_step_index_modes' &&
    value.model_version === '1.0.0' &&
    value.catalog_label ===
      'Supported scalar LP modes — weak-guidance step-index model' &&
    value.field_label ===
      'Scalar LP mode field — weak-guidance step-index model' &&
    value.field_normalization === 'unit_peak_absolute_field' &&
    value.angular_basis === 'cosine_representative' &&
    value.excitation_status === 'not_calculated' &&
    isStringArray(value.assumptions) &&
    isStringArray(value.limitations)
  )
}

export function isScalarLPModeFamily(
  value: unknown,
): value is ScalarLPModeFamily {
  if (
    !isRecord(value) ||
    typeof value.label !== 'string' ||
    !isFiniteNumber(value.azimuthal_order) ||
    !Number.isSafeInteger(value.azimuthal_order) ||
    value.azimuthal_order < 0 ||
    value.azimuthal_order > 64 ||
    !isFiniteNumber(value.radial_order) ||
    !Number.isSafeInteger(value.radial_order) ||
    value.radial_order < 1 ||
    value.radial_order > 64 ||
    (value.spatial_degeneracy !== 1 && value.spatial_degeneracy !== 2) ||
    !isFiniteNumber(value.cutoff_v_dimensionless) ||
    value.cutoff_v_dimensionless < 0 ||
    !isPositiveFiniteNumber(value.v_number_dimensionless) ||
    value.v_number_dimensionless <= value.cutoff_v_dimensionless ||
    !isPositiveFiniteNumber(value.u_dimensionless) ||
    !isPositiveFiniteNumber(value.w_dimensionless) ||
    !isFiniteNumber(value.normalized_propagation_constant) ||
    value.normalized_propagation_constant <= 0 ||
    value.normalized_propagation_constant >= 1 ||
    !isPositiveFiniteNumber(value.effective_index_dimensionless) ||
    !isPositiveFiniteNumber(value.beta_per_m)
  ) {
    return false
  }

  const azimuthalOrder = value.azimuthal_order as number
  const radialOrder = value.radial_order as number
  const vNumber = value.v_number_dimensionless as number
  const uValue = value.u_dimensionless as number
  const wValue = value.w_dimensionless as number
  return (
    value.label === `LP${azimuthalOrder}${radialOrder}` &&
    value.spatial_degeneracy === (azimuthalOrder === 0 ? 1 : 2) &&
    approximatelyEqual(uValue * uValue + wValue * wValue, vNumber * vNumber) &&
    approximatelyEqual(
      value.normalized_propagation_constant as number,
      (wValue / vNumber) ** 2,
    )
  )
}

export function isScalarLPModeCatalog(
  value: unknown,
): value is ScalarLPModeCatalog {
  if (
    !isRecord(value) ||
    !isPositiveFiniteNumber(value.wavelength_m) ||
    !isPositiveFiniteNumber(value.core_radius_m) ||
    !isPositiveFiniteNumber(value.n_core) ||
    !isPositiveFiniteNumber(value.n_cladding) ||
    value.n_core <= value.n_cladding ||
    !isPositiveFiniteNumber(value.v_number_dimensionless) ||
    (value.mode_regime !== 'single_mode' &&
      value.mode_regime !== 'multimode') ||
    typeof value.catalog_truncated !== 'boolean' ||
    !Array.isArray(value.mode_families) ||
    value.mode_families.length < 1 ||
    value.mode_families.length > MAX_MODE_FAMILIES ||
    !value.mode_families.every(isScalarLPModeFamily) ||
    !isStringArray(value.warnings) ||
    !isManifest(value.model_manifest)
  ) {
    return false
  }

  const families = value.mode_families as ScalarLPModeFamily[]
  const nCore = value.n_core as number
  const nCladding = value.n_cladding as number
  const expectedVNumber = opticalVNumber(
    value.wavelength_m,
    value.core_radius_m,
    nCore,
    nCladding,
  )
  const k0PerM = (2 * Math.PI) / value.wavelength_m
  if (
    !approximatelyEqual(value.v_number_dimensionless, expectedVNumber) ||
    families[0].label !== 'LP01' ||
    new Set(families.map((mode) => mode.label)).size !== families.length ||
    families.some(
      (mode) =>
        !approximatelyEqual(
          mode.v_number_dimensionless,
          value.v_number_dimensionless as number,
        ) ||
        mode.effective_index_dimensionless <= nCladding ||
        mode.effective_index_dimensionless >= nCore ||
        !approximatelyEqual(
          mode.beta_per_m,
          k0PerM * mode.effective_index_dimensionless,
        ),
    ) ||
    families.some(
      (mode, index) =>
        index > 0 &&
        mode.cutoff_v_dimensionless <
          families[index - 1].cutoff_v_dimensionless,
    )
  ) {
    return false
  }

  return (
    value.catalog_truncated ||
    value.mode_regime === (families.length === 1 ? 'single_mode' : 'multimode')
  )
}

function isAxis(
  value: unknown,
  gridPoints: number,
  halfWidth: number,
): value is number[] {
  if (
    !Array.isArray(value) ||
    value.length !== gridPoints ||
    !value.every(isFiniteNumber)
  ) {
    return false
  }
  const axis = value as number[]
  const center = (gridPoints - 1) / 2
  return (
    axis.every(
      (coordinate, index) => index === 0 || coordinate > axis[index - 1],
    ) &&
    axis[center] === 0 &&
    approximatelyEqual(axis[0], -halfWidth) &&
    approximatelyEqual(axis.at(-1) as number, halfWidth) &&
    axis.every((coordinate, index) =>
      approximatelyEqual(coordinate, -axis.at(-1 - index)!),
    )
  )
}

export function isScalarLPModeFieldResult(
  value: unknown,
  request?: ScalarLPModeFieldRequest,
): value is ScalarLPModeFieldResult {
  if (
    !isRecord(value) ||
    !isPositiveFiniteNumber(value.wavelength_m) ||
    !isPositiveFiniteNumber(value.core_radius_m) ||
    !isPositiveFiniteNumber(value.n_core) ||
    !isPositiveFiniteNumber(value.n_cladding) ||
    value.n_core <= value.n_cladding ||
    !isScalarLPModeFamily(value.selected_mode) ||
    !isPositiveFiniteNumber(value.grid_half_width_m) ||
    !isFiniteNumber(value.grid_points) ||
    !Number.isSafeInteger(value.grid_points) ||
    value.grid_points < MIN_GRID_POINTS ||
    value.grid_points > MAX_GRID_POINTS ||
    value.grid_points % 2 === 0 ||
    !isManifest(value.model_manifest)
  ) {
    return false
  }

  const gridPoints = value.grid_points as number
  const halfWidth = value.grid_half_width_m as number
  const expectedVNumber = opticalVNumber(
    value.wavelength_m,
    value.core_radius_m,
    value.n_core,
    value.n_cladding,
  )
  const k0PerM = (2 * Math.PI) / value.wavelength_m
  if (
    !approximatelyEqual(
      value.selected_mode.v_number_dimensionless,
      expectedVNumber,
    ) ||
    value.selected_mode.effective_index_dimensionless <= value.n_cladding ||
    value.selected_mode.effective_index_dimensionless >= value.n_core ||
    !approximatelyEqual(
      value.selected_mode.beta_per_m,
      k0PerM * value.selected_mode.effective_index_dimensionless,
    ) ||
    !isAxis(value.x_m, gridPoints, halfWidth) ||
    !isAxis(value.y_m, gridPoints, halfWidth) ||
    !Array.isArray(value.normalized_field) ||
    !Array.isArray(value.normalized_intensity) ||
    value.normalized_field.length !== gridPoints ||
    value.normalized_intensity.length !== gridPoints
  ) {
    return false
  }

  let maximumAbsoluteField = 0
  for (let rowIndex = 0; rowIndex < gridPoints; rowIndex += 1) {
    const fieldRow = value.normalized_field[rowIndex]
    const intensityRow = value.normalized_intensity[rowIndex]
    if (
      !Array.isArray(fieldRow) ||
      !Array.isArray(intensityRow) ||
      fieldRow.length !== gridPoints ||
      intensityRow.length !== gridPoints
    ) {
      return false
    }
    for (let columnIndex = 0; columnIndex < gridPoints; columnIndex += 1) {
      const field = fieldRow[columnIndex]
      const intensity = intensityRow[columnIndex]
      if (
        !isFiniteNumber(field) ||
        field < -1 ||
        field > 1 ||
        !isFiniteNumber(intensity) ||
        intensity < 0 ||
        intensity > 1 ||
        !approximatelyEqual(intensity, field * field)
      ) {
        return false
      }
      maximumAbsoluteField = Math.max(maximumAbsoluteField, Math.abs(field))
    }
  }

  if (!approximatelyEqual(maximumAbsoluteField, 1)) {
    return false
  }
  if (request === undefined) {
    return true
  }
  return (
    value.wavelength_m === request.wavelength_m &&
    value.core_radius_m === request.core_radius_m &&
    value.n_core === request.n_core &&
    value.n_cladding === request.n_cladding &&
    value.grid_half_width_m === request.grid_half_width_m &&
    value.grid_points === request.grid_points &&
    value.selected_mode.azimuthal_order === request.azimuthal_order &&
    value.selected_mode.radial_order === request.radial_order
  )
}

export function toScalarModeFieldData(
  value: ScalarLPModeFieldResult,
): ScalarModeFieldData {
  return {
    coreRadiusUm: value.core_radius_m * 1e6,
    gridHalfWidthUm: value.grid_half_width_m * 1e6,
    gridPoints: value.grid_points,
    xUm: value.x_m.map((coordinate) => coordinate * 1e6),
    yUm: value.y_m.map((coordinate) => coordinate * 1e6),
    normalizedField: value.normalized_field,
    normalizedIntensity: value.normalized_intensity,
    selectedMode: value.selected_mode,
    modelId: value.model_manifest.model_id,
    modelVersion: value.model_manifest.model_version,
    fieldLabel: value.model_manifest.field_label,
    normalizationConvention: value.model_manifest.field_normalization,
    angularBasis: value.model_manifest.angular_basis,
    excitationStatus: value.model_manifest.excitation_status,
  }
}
