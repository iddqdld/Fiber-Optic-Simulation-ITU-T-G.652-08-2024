import { describe, expect, test } from 'vitest'

import type { components } from '../../../packages/shared_schemas/generated/api'
import {
  formatComparisonNumber,
  getComparisonMetrics,
  getParameterDifferences,
  getPowerComparisonSeries,
  getRadialComparisonSeries,
  type ComparisonResult,
} from './comparison'

type GuidanceResult = components['schemas']['GuidanceResult']
type AttenuationResult = components['schemas']['ConstantAttenuationResult']
type MacrobendLossResult = components['schemas']['MacrobendLossResult']
type GroupDelayResult = components['schemas']['GroupDelayResult']
type PulseBroadeningResult =
  components['schemas']['ChromaticPulseBroadeningResult']
type ModeProfileResult = components['schemas']['GaussianModeProfileResult']

const configuration = {
  preset: 'custom',
  fibre: {
    n_core: 1.47,
    n_cladding: 1.465,
    core_radius_um: 4.1,
    mode_field_radius_um: 4.82,
    attenuation_db_per_km: 0.2,
    dispersion_ps_per_nm_km: 17,
    group_index_dimensionless: 1.468,
    cable_application: 'standard_cable',
  },
  source: {
    wavelength_nm: 1550,
    input_power_dbm: -3,
    spectral_width_fwhm_nm: 0.2,
    input_pulse_fwhm_ps: 25,
  },
  section: { bends: [], length_km: 12.5 },
  sampling: { grid_half_width_um: 15, grid_points: 5 },
} satisfies ComparisonResult['configuration']

const guidance = {
  critical_angle_deg: 85,
  numerical_aperture_dimensionless: 0.121,
  air_acceptance_angle_deg: 7,
  relative_index_difference_dimensionless: 0.0034,
  v_number_dimensionless: 2.013,
  mode_regime: 'single_mode',
  approximate_mode_count: null,
  warnings: [],
  model_manifest: {
    model_id: 'ideal_circular_step_index_guidance',
    model_version: '1.0.0',
    mode_regime_cutoff_v_dimensionless: 2.405,
    mode_count_min_v_dimensionless: 10,
    assumptions: [],
    limitations: [],
  },
} satisfies GuidanceResult

const attenuation = {
  attenuation_db_per_km: 0.2,
  distance_samples_km: [0, 5, 10],
  input_power_dbm: -3,
  length_km: 10,
  power_samples_dbm: [-3, -4, -5],
  section_loss_db: 2,
  output_power_dbm: -5,
  model_manifest: {
    model_id: 'constant_fibre_attenuation',
    model_version: '1.0.0',
    assumptions: [],
    limitations: [],
  },
} satisfies AttenuationResult

const bendLoss = {
  bends: [],
  input_power_dbm: -5,
  model_manifest: {
    aggregation: 'additive_db',
    assumptions: [],
    limitations: [],
    loss_source: 'user_supplied',
    model_id: 'user_supplied_macrobend_loss',
    model_version: '1.0.0',
  },
  output_power_dbm: -5,
  total_bend_loss_db: 0,
} satisfies MacrobendLossResult

const groupDelay = {
  group_delay_ps: 48,
  group_index_dimensionless: 1.468,
  length_km: 10,
  model_manifest: {
    model_id: 'constant_group_index_delay',
    model_version: '1.0.0',
    vacuum_speed_m_per_s: 299792458,
    assumptions: [],
    limitations: [],
  },
} satisfies GroupDelayResult

const pulseBroadening = {
  accumulated_dispersion_ps_per_nm: 170,
  dispersion_broadening_fwhm_ps: 42,
  dispersion_ps_per_nm_km: 17,
  input_pulse_fwhm_ps: 25,
  length_km: 10,
  output_pulse_fwhm_ps: 49,
  spectral_width_fwhm_nm: 0.2,
  model_manifest: {
    model_id: 'first_order_chromatic_pulse_broadening',
    model_version: '1.0.0',
    width_convention: 'fwhm',
    assumptions: [],
    limitations: [],
  },
} satisfies PulseBroadeningResult

const modeProfileManifest = {
  model_id: 'gaussian_lp01_mode_profile',
  model_version: '1.0.0',
  normalization_convention: 'unit_peak_field_and_intensity',
  radius_convention: '1/e_field_radius',
  assumptions: [],
  limitations: [],
} satisfies ModeProfileResult['model_manifest']

function buildModeProfile(
  xUm: number[],
  yUm: number[],
  normalizedIntensity: number[][],
): ModeProfileResult {
  return {
    grid_half_width_um: Math.max(...xUm.map((value) => Math.abs(value))),
    grid_points: xUm.length,
    mode_field_radius_um: 4.82,
    model_manifest: modeProfileManifest,
    normalized_field: normalizedIntensity,
    normalized_intensity: normalizedIntensity,
    x_um: xUm,
    y_um: yUm,
  }
}

const baseModeProfile = buildModeProfile(
  [-4, -2, 0, 2, 4],
  [-4, -2, 0, 2, 4],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0.1, 0.3, 0.7, 0.5, 0.2],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
)

const baseResult = {
  configuration,
  guidance,
  attenuation,
  bend_loss: bendLoss,
  group_delay: groupDelay,
  pulse_broadening: pulseBroadening,
  mode_profile: baseModeProfile,
  model_manifest: {
    model_id: 'level1_single_section_simulation',
    model_version: '1.1.0',
    component_model_ids: [],
    assumptions: [],
    limitations: [],
  },
  standards_checks: {
    preset: 'custom',
    preset_definition: null,
    dispersion: null,
    attenuation: null,
  },
  parameter_boundaries: [],
  warnings: [],
} satisfies ComparisonResult

function withResultChanges(
  changes: Partial<{
    guidance: Partial<GuidanceResult>
    attenuation: Partial<AttenuationResult>
    bend_loss: Partial<MacrobendLossResult>
    group_delay: Partial<GroupDelayResult>
    pulse_broadening: Partial<PulseBroadeningResult>
    mode_profile: ModeProfileResult
    configuration: ComparisonResult['configuration']
  }>,
): ComparisonResult {
  return {
    ...baseResult,
    ...changes,
    guidance: { ...baseResult.guidance, ...changes.guidance },
    attenuation: { ...baseResult.attenuation, ...changes.attenuation },
    bend_loss: { ...baseResult.bend_loss, ...changes.bend_loss },
    group_delay: { ...baseResult.group_delay, ...changes.group_delay },
    pulse_broadening: {
      ...baseResult.pulse_broadening,
      ...changes.pulse_broadening,
    },
  }
}

describe('comparison derivation', () => {
  test('derives the ordered metrics from exact backend result fields', () => {
    const variant = withResultChanges({
      guidance: {
        v_number_dimensionless: 2.5,
        numerical_aperture_dimensionless: 0.14,
      },
      attenuation: {
        section_loss_db: 3,
      },
      bend_loss: { output_power_dbm: -6 },
      group_delay: { group_delay_ps: 53 },
      pulse_broadening: {
        dispersion_broadening_fwhm_ps: 45,
        output_pulse_fwhm_ps: 52,
      },
    })

    expect(getComparisonMetrics(baseResult, variant)).toEqual([
      {
        id: 'v-number',
        label: 'V-number',
        unit: 'dimensionless',
        baselineValue: 2.013,
        variantValue: 2.5,
        delta: 2.5 - 2.013,
      },
      {
        id: 'numerical-aperture',
        label: 'Numerical aperture',
        unit: 'dimensionless',
        baselineValue: 0.121,
        variantValue: 0.14,
        delta: 0.14 - 0.121,
      },
      {
        id: 'section-loss',
        label: 'Section loss',
        unit: 'dB',
        baselineValue: 2,
        variantValue: 3,
        delta: 1,
      },
      {
        id: 'output-power',
        label: 'Output power',
        unit: 'dBm',
        baselineValue: -5,
        variantValue: -6,
        delta: -1,
      },
      {
        id: 'group-delay',
        label: 'Group delay',
        unit: 'ps',
        baselineValue: 48,
        variantValue: 53,
        delta: 5,
      },
      {
        id: 'dispersion-broadening-fwhm',
        label: 'Dispersion broadening FWHM',
        unit: 'ps',
        baselineValue: 42,
        variantValue: 45,
        delta: 3,
      },
      {
        id: 'output-pulse-fwhm',
        label: 'Output pulse FWHM',
        unit: 'ps',
        baselineValue: 49,
        variantValue: 52,
        delta: 3,
      },
    ])
  })

  test('returns zero deltas without negative zero', () => {
    const baseline = withResultChanges({
      guidance: {
        v_number_dimensionless: 0,
        numerical_aperture_dimensionless: -0,
      },
    })
    const variant = withResultChanges({
      guidance: {
        v_number_dimensionless: -0,
        numerical_aperture_dimensionless: 0,
      },
    })

    const metrics = getComparisonMetrics(baseline, variant)

    expect(metrics[0].delta).toBe(0)
    expect(metrics[1].delta).toBe(0)
    expect(Object.is(metrics[0].delta, -0)).toBe(false)
    expect(Object.is(metrics[1].delta, -0)).toBe(false)
  })

  test('reports every editable configuration field in stable physical order', () => {
    const variantConfiguration = {
      preset: 'g652d',
      fibre: {
        ...configuration.fibre,
        n_core: 1.48,
        n_cladding: 1.46,
        core_radius_um: 4.2,
        mode_field_radius_um: 4.9,
        group_index_dimensionless: 1.47,
        attenuation_db_per_km: 0.3,
        dispersion_ps_per_nm_km: 18,
        cable_application: 'drop_cable',
      },
      source: {
        ...configuration.source,
        wavelength_nm: 1310,
        input_power_dbm: -2,
        spectral_width_fwhm_nm: 0.3,
        input_pulse_fwhm_ps: 30,
      },
      section: { bends: [], length_km: 15 },
      sampling: { grid_half_width_um: 20, grid_points: 7 },
    } satisfies ComparisonResult['configuration']

    expect(
      getParameterDifferences(configuration, variantConfiguration),
    ).toEqual([
      {
        field: 'preset',
        label: 'Fibre preset',
        unit: null,
        baselineValue: 'custom',
        variantValue: 'g652d',
        delta: null,
      },
      {
        field: 'fibre.n_core',
        label: 'Core refractive index',
        unit: 'dimensionless',
        baselineValue: '1.47',
        variantValue: '1.48',
        delta: 1.48 - 1.47,
      },
      {
        field: 'fibre.n_cladding',
        label: 'Cladding refractive index',
        unit: 'dimensionless',
        baselineValue: '1.465',
        variantValue: '1.46',
        delta: 1.46 - 1.465,
      },
      {
        field: 'fibre.core_radius_um',
        label: 'Core radius',
        unit: 'µm',
        baselineValue: '4.1',
        variantValue: '4.2',
        delta: 4.2 - 4.1,
      },
      {
        field: 'fibre.mode_field_radius_um',
        label: 'Mode-field radius',
        unit: 'µm',
        baselineValue: '4.82',
        variantValue: '4.9',
        delta: 4.9 - 4.82,
      },
      {
        field: 'fibre.group_index_dimensionless',
        label: 'Group index',
        unit: 'dimensionless',
        baselineValue: '1.468',
        variantValue: '1.47',
        delta: 1.47 - 1.468,
      },
      {
        field: 'fibre.attenuation_db_per_km',
        label: 'Attenuation',
        unit: 'dB/km',
        baselineValue: '0.2',
        variantValue: '0.3',
        delta: 0.3 - 0.2,
      },
      {
        field: 'fibre.dispersion_ps_per_nm_km',
        label: 'Dispersion',
        unit: 'ps/(nm·km)',
        baselineValue: '17',
        variantValue: '18',
        delta: 1,
      },
      {
        field: 'fibre.cable_application',
        label: 'Cable application',
        unit: null,
        baselineValue: 'standard_cable',
        variantValue: 'drop_cable',
        delta: null,
      },
      {
        field: 'source.wavelength_nm',
        label: 'Wavelength',
        unit: 'nm',
        baselineValue: '1550',
        variantValue: '1310',
        delta: -240,
      },
      {
        field: 'source.input_power_dbm',
        label: 'Input power',
        unit: 'dBm',
        baselineValue: '-3',
        variantValue: '-2',
        delta: 1,
      },
      {
        field: 'source.spectral_width_fwhm_nm',
        label: 'Spectral width FWHM',
        unit: 'nm',
        baselineValue: '0.2',
        variantValue: '0.3',
        delta: 0.3 - 0.2,
      },
      {
        field: 'source.input_pulse_fwhm_ps',
        label: 'Input pulse FWHM',
        unit: 'ps',
        baselineValue: '25',
        variantValue: '30',
        delta: 5,
      },
      {
        field: 'section.length_km',
        label: 'Section length',
        unit: 'km',
        baselineValue: '12.5',
        variantValue: '15',
        delta: 2.5,
      },
      {
        field: 'sampling.grid_half_width_um',
        label: 'Grid half-width',
        unit: 'µm',
        baselineValue: '15',
        variantValue: '20',
        delta: 5,
      },
      {
        field: 'sampling.grid_points',
        label: 'Grid points',
        unit: 'count',
        baselineValue: '5',
        variantValue: '7',
        delta: 2,
      },
    ])
  })

  test('omits unchanged fields and keeps categorical deltas null', () => {
    const variantConfiguration = {
      ...configuration,
      preset: 'g652d',
      fibre: { ...configuration.fibre, cable_application: 'short_jumper' },
    } satisfies ComparisonResult['configuration']

    expect(
      getParameterDifferences(configuration, variantConfiguration),
    ).toEqual([
      {
        field: 'preset',
        label: 'Fibre preset',
        unit: null,
        baselineValue: 'custom',
        variantValue: 'g652d',
        delta: null,
      },
      {
        field: 'fibre.cable_application',
        label: 'Cable application',
        unit: null,
        baselineValue: 'standard_cable',
        variantValue: 'short_jumper',
        delta: null,
      },
    ])
  })

  test('preserves power samples and uses raw shared domains, including zero spans', () => {
    const variant = withResultChanges({
      attenuation: {
        distance_samples_km: [0, 2, 6, 9],
        power_samples_dbm: [-5, -5.5, -6, -7],
      },
    })

    expect(getPowerComparisonSeries(baseResult, variant)).toEqual({
      baseline: [
        { x: 0, y: -3 },
        { x: 5, y: -4 },
        { x: 10, y: -5 },
      ],
      variant: [
        { x: 0, y: -5 },
        { x: 2, y: -5.5 },
        { x: 6, y: -6 },
        { x: 9, y: -7 },
      ],
      xDomain: [0, 10],
      yDomain: [-7, -3],
    })

    const zero = withResultChanges({
      attenuation: {
        distance_samples_km: [0],
        power_samples_dbm: [0],
      },
    })

    expect(getPowerComparisonSeries(zero, zero)).toMatchObject({
      xDomain: [0, 0],
      yDomain: [0, 0],
    })
  })

  test('extracts exact non-negative y=0 radial samples without resampling', () => {
    const variant = withResultChanges({
      mode_profile: buildModeProfile(
        [-5, -1, 0, 1, 3],
        [-5, -2, 0, 2, 5],
        [
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0.91, 0.81, 0.71, 0.61, 0.51],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
      ),
    })

    expect(getRadialComparisonSeries(baseResult, variant)).toEqual({
      baseline: [
        { x: 0, y: 0.7 },
        { x: 2, y: 0.5 },
        { x: 4, y: 0.2 },
      ],
      variant: [
        { x: 0, y: 0.71 },
        { x: 1, y: 0.61 },
        { x: 3, y: 0.51 },
      ],
      xDomain: [0, 4],
      yDomain: [0, 1],
    })
  })

  test('formats zero, ordinary values, and scientific extremes deterministically', () => {
    expect(formatComparisonNumber(0)).toBe('0')
    expect(formatComparisonNumber(-0)).toBe('0')
    expect(formatComparisonNumber(1.2)).toBe('1.2')
    expect(formatComparisonNumber(123.456789)).toBe('123.457')
    expect(formatComparisonNumber(1_000_000)).toBe('1e+6')
    expect(formatComparisonNumber(-0.00000012345)).toBe('-1.2345e-7')
    expect(formatComparisonNumber(Number.MAX_VALUE)).toBe('1.79769e+308')
    expect(formatComparisonNumber(Number.MIN_VALUE)).toBe('4.94066e-324')
  })

  test('does not mutate configurations, results, or backend sample arrays', () => {
    const baseline = structuredClone(baseResult)
    const baselineSnapshot = structuredClone(baseline)
    const variant = withResultChanges({
      attenuation: {
        distance_samples_km: [0, 1],
        power_samples_dbm: [-3, -4],
      },
      mode_profile: buildModeProfile(
        [-2, -1, 0, 1, 2],
        [-2, -1, 0, 1, 2],
        [
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0.4, 0.5, 0.6, 0.7, 0.8],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
      ),
    })
    const variantSnapshot = structuredClone(variant)

    getComparisonMetrics(baseline, variant)
    getParameterDifferences(baseline.configuration, variant.configuration)
    getPowerComparisonSeries(baseline, variant)
    getRadialComparisonSeries(baseline, variant)

    expect(baseline).toEqual(baselineSnapshot)
    expect(variant).toEqual(variantSnapshot)
  })
})
