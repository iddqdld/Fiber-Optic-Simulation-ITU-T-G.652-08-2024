import type { components } from '../../../packages/shared_schemas/generated/api'

export type NumericFormField = components['schemas']['Level1ParameterField']

export type BoundaryKind = 'input' | 'model' | 'standard'

export type FieldBoundary = {
  kind: BoundaryKind
  label: string
  rangeText: string
  dependsOn: readonly NumericFormField[]
  sourceModelId: string
}

export type FieldBoundaries = Partial<
  Record<NumericFormField, readonly FieldBoundary[]>
>

const NUMERIC_FIELD_LABELS: Record<NumericFormField, string> = {
  n_core: 'Core refractive index (dimensionless)',
  n_cladding: 'Cladding refractive index (dimensionless)',
  core_radius_um: 'Core radius (µm)',
  mode_field_radius_um: 'Mode-field radius (µm)',
  attenuation_db_per_km: 'Attenuation (dB/km)',
  dispersion_ps_per_nm_km: 'Dispersion (ps/(nm km))',
  group_index_dimensionless: 'Group index (dimensionless)',
  wavelength_nm: 'Wavelength (nm)',
  input_power_dbm: 'Input power (dBm)',
  spectral_width_fwhm_nm: 'Spectral width FWHM (nm)',
  input_pulse_fwhm_ps: 'Input pulse FWHM (ps)',
  length_km: 'Section length (km)',
  grid_half_width_um: 'Grid half-width (µm)',
  grid_points: 'Grid points (count)',
}

export function getNumericFieldLabel(field: NumericFormField): string {
  return NUMERIC_FIELD_LABELS[field]
}

export function getBoundaryKindLabel(kind: BoundaryKind): string {
  return kind === 'input' ? 'Input' : kind === 'model' ? 'Model' : 'Standard'
}
