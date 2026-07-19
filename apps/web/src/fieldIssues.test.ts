import { describe, expect, test } from 'vitest'

import type { operations } from '../../../packages/shared_schemas/generated/api'
import type { FormValues } from './Level1Form'
import { getFieldIssues, type FieldIssue } from './fieldIssues'

type PreviewResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']
type WarningCode = PreviewResult['warnings'][number]['code']
type AttenuationCheck = NonNullable<
  PreviewResult['standards_checks']['attenuation']
>
type DispersionCheck = NonNullable<
  PreviewResult['standards_checks']['dispersion']
>

const validValues: FormValues = {
  preset: 'custom',
  n_core: '1.47',
  n_cladding: '1.465',
  core_radius_um: '4.1',
  mode_field_radius_um: '4.82',
  attenuation_db_per_km: '0.2',
  dispersion_ps_per_nm_km: '17',
  group_index_dimensionless: '1.468',
  cable_application: 'standard_cable',
  wavelength_nm: '1550',
  input_power_dbm: '-3',
  spectral_width_fwhm_nm: '0.2',
  input_pulse_fwhm_ps: '25',
  length_km: '12.5',
  grid_half_width_um: '15',
  grid_points: '65',
}

function issue(tone: FieldIssue['tone'], message: string): FieldIssue {
  return { tone, message }
}

function warning(code: WarningCode): PreviewResult['warnings'][number] {
  return {
    code,
    message: 'Backend warning',
    output_field: 'guidance.output',
    source_model_id: 'test-model',
  }
}

function attenuationCheck(
  overrides: Partial<AttenuationCheck> = {},
): AttenuationCheck {
  return {
    status: 'pass',
    wavelength_nm: 1550,
    supplied_attenuation_db_per_km: 0.2,
    maximum_attenuation_db_per_km: 0.3,
    not_applicable_reason: null,
    ...overrides,
  } as AttenuationCheck
}

function dispersionCheck(
  overrides: Partial<DispersionCheck> = {},
): DispersionCheck {
  return {
    status: 'pass',
    wavelength_nm: 1550,
    supplied_dispersion_ps_per_nm_km: 17,
    minimum_dispersion_ps_per_nm_km: 8,
    maximum_dispersion_ps_per_nm_km: 18,
    ...overrides,
  } as DispersionCheck
}

function previewResult({
  warnings = [],
  modeCountMinV = 10,
  vNumber = 2.0133583577642065,
  numericalAperture = 0.12114041439585586,
  preset = 'custom',
  attenuation = null,
  dispersion = null,
}: {
  warnings?: PreviewResult['warnings']
  modeCountMinV?: number
  vNumber?: number
  numericalAperture?: number
  preset?: PreviewResult['standards_checks']['preset']
  attenuation?: PreviewResult['standards_checks']['attenuation']
  dispersion?: PreviewResult['standards_checks']['dispersion']
} = {}): PreviewResult {
  return {
    guidance: {
      v_number_dimensionless: vNumber,
      numerical_aperture_dimensionless: numericalAperture,
      model_manifest: {
        mode_count_min_v_dimensionless: modeCountMinV,
      },
      warnings: [],
    },
    standards_checks: {
      preset,
      attenuation,
      dispersion,
    },
    warnings,
  } as unknown as PreviewResult
}

describe('getFieldIssues', () => {
  test('returns no issues for valid local values without a preview result', () => {
    expect(getFieldIssues(validValues, null)).toEqual({})
  })

  test('marks empty and nonfinite numeric values as errors', () => {
    const issues = getFieldIssues(
      {
        ...validValues,
        n_core: '   ',
        input_power_dbm: 'Infinity',
      },
      null,
    )

    expect(issues.n_core).toEqual([issue('error', 'Must be a finite number.')])
    expect(issues.input_power_dbm).toEqual([
      issue('error', 'Must be a finite number.'),
    ])
  })

  test('marks all strictly-positive boundaries as errors', () => {
    const issues = getFieldIssues(
      {
        ...validValues,
        n_core: '0',
        n_cladding: '0',
        core_radius_um: '0',
        mode_field_radius_um: '0',
        group_index_dimensionless: '0',
        wavelength_nm: '0',
        input_pulse_fwhm_ps: '0',
        grid_half_width_um: '0',
      },
      null,
    )

    for (const field of [
      'n_core',
      'n_cladding',
      'core_radius_um',
      'mode_field_radius_um',
      'group_index_dimensionless',
      'wavelength_nm',
      'input_pulse_fwhm_ps',
      'grid_half_width_um',
    ] as const) {
      expect(issues[field]).toContainEqual(
        issue('error', 'Must be greater than 0.'),
      )
    }
  })

  test('marks all nonnegative boundaries as errors while allowing signed dispersion and power', () => {
    const issues = getFieldIssues(
      {
        ...validValues,
        attenuation_db_per_km: '-0.1',
        spectral_width_fwhm_nm: '-0.1',
        length_km: '-0.1',
        dispersion_ps_per_nm_km: '-17',
        input_power_dbm: '-30',
      },
      null,
    )

    expect(issues.attenuation_db_per_km).toEqual([
      issue('error', 'Must be at least 0.'),
    ])
    expect(issues.spectral_width_fwhm_nm).toEqual([
      issue('error', 'Must be at least 0.'),
    ])
    expect(issues.length_km).toEqual([issue('error', 'Must be at least 0.')])
    expect(issues.dispersion_ps_per_nm_km).toBeUndefined()
    expect(issues.input_power_dbm).toBeUndefined()
  })

  test('marks the refractive-index relation on both fields', () => {
    const issues = getFieldIssues(
      { ...validValues, n_core: '1.465', n_cladding: '1.465' },
      null,
    )
    const relationIssue = issue('error', 'Must satisfy n_core > n_cladding.')

    expect(issues.n_core).toContainEqual(relationIssue)
    expect(issues.n_cladding).toContainEqual(relationIssue)
  })

  test('requires grid_points to be an odd integer in the inclusive 3–65 range', () => {
    for (const gridPoints of ['2', '4', '65.5', '66']) {
      expect(
        getFieldIssues({ ...validValues, grid_points: gridPoints }, null)
          .grid_points,
      ).toEqual([issue('error', 'Must be an odd integer from 3 to 65.')])
    }

    expect(
      getFieldIssues({ ...validValues, grid_points: '3' }, null).grid_points,
    ).toBeUndefined()
    expect(
      getFieldIssues({ ...validValues, grid_points: '65' }, null).grid_points,
    ).toBeUndefined()
  })

  test('applies the inclusive G.652.D wavelength boundary only to the preset', () => {
    const below = getFieldIssues(
      { ...validValues, preset: 'g652d', wavelength_nm: '1259' },
      null,
    )
    const above = getFieldIssues(
      { ...validValues, preset: 'g652d', wavelength_nm: '1626' },
      null,
    )

    expect(below.wavelength_nm).toEqual([
      issue('error', 'G.652.D wavelength must be between 1260 and 1625 nm.'),
    ])
    expect(above.wavelength_nm).toEqual(below.wavelength_nm)
    expect(
      getFieldIssues(
        { ...validValues, preset: 'g652d', wavelength_nm: '1260' },
        null,
      ).wavelength_nm,
    ).toBeUndefined()
    expect(
      getFieldIssues(
        { ...validValues, preset: 'g652d', wavelength_nm: '1625' },
        null,
      ).wavelength_nm,
    ).toBeUndefined()
    expect(
      getFieldIssues({ ...validValues, wavelength_nm: '2000' }, null)
        .wavelength_nm,
    ).toBeUndefined()
  })

  test('does not attach a mode-count warning to editable inputs', () => {
    const issues = getFieldIssues(
      validValues,
      previewResult({
        warnings: [warning('mode_count_unavailable')],
        modeCountMinV: 10,
        vNumber: 2.013,
      }),
    )

    expect(issues).toEqual({})
  })

  test('does not attach an air-acceptance warning to editable inputs', () => {
    const issues = getFieldIssues(
      validValues,
      previewResult({
        warnings: [warning('air_acceptance_angle_unavailable')],
        numericalAperture: 1.125,
      }),
    )

    expect(issues).toEqual({})
  })

  test('adds exact backend attenuation and dispersion failure bounds', () => {
    const issues = getFieldIssues(
      { ...validValues, preset: 'g652d' },
      previewResult({
        preset: 'g652d',
        attenuation: attenuationCheck({
          status: 'fail_above_maximum',
          maximum_attenuation_db_per_km: 0.3,
          wavelength_nm: 1550,
        }),
        dispersion: dispersionCheck({
          status: 'fail_below_minimum',
          minimum_dispersion_ps_per_nm_km: 8,
          maximum_dispersion_ps_per_nm_km: 18,
          wavelength_nm: 1550,
        }),
      }),
    )

    expect(issues.attenuation_db_per_km).toEqual([
      issue('error', 'G.652.D attenuation must be <= 0.3 dB/km at 1550 nm.'),
    ])
    expect(issues.dispersion_ps_per_nm_km).toEqual([
      issue(
        'error',
        'G.652.D dispersion must be between 8 and 18 ps/(nm·km) at 1550 nm.',
      ),
    ])
  })

  test('targets cable application for nonstandard attenuation and includes the backend reason', () => {
    const reason =
      'G.652.D Table 2 attenuation values are not intended for short jumpers, indoor cables, or drop cables.'
    const issues = getFieldIssues(
      { ...validValues, preset: 'g652d', cable_application: 'drop_cable' },
      previewResult({
        preset: 'g652d',
        attenuation: attenuationCheck({
          status: 'not_applicable',
          cable_application: 'drop_cable',
          not_applicable_reason: reason,
          maximum_attenuation_db_per_km: null,
        }),
      }),
    )

    expect(issues.cable_application).toEqual([issue('warning', reason)])
    expect(issues.attenuation_db_per_km).toBeUndefined()
  })

  test('targets wavelength for standard-cable attenuation gaps with range and reason', () => {
    const reason =
      "Table 2's direct broad attenuation limit begins at 1310 nm; the 1260-1310 nm extension note requires a measured 1310 nm value."
    const issues = getFieldIssues(
      { ...validValues, preset: 'g652d', wavelength_nm: '1260' },
      previewResult({
        preset: 'g652d',
        attenuation: attenuationCheck({
          status: 'not_applicable',
          not_applicable_reason: reason,
          maximum_attenuation_db_per_km: null,
        }),
      }),
    )

    expect(issues.wavelength_nm).toEqual([
      issue(
        'warning',
        `G.652.D direct attenuation range is 1310–1625 nm; ${reason}`,
      ),
    ])
  })

  test('keeps local and direct G.652.D issues while ignoring derived warnings', () => {
    const issues = getFieldIssues(
      {
        ...validValues,
        preset: 'g652d',
        n_core: '1.465',
        n_cladding: '1.465',
      },
      previewResult({
        warnings: [
          warning('mode_count_unavailable'),
          warning('mode_count_unavailable'),
          warning('air_acceptance_angle_unavailable'),
          warning('air_acceptance_angle_unavailable'),
        ],
        preset: 'g652d',
        vNumber: 2,
        attenuation: attenuationCheck({
          status: 'fail_above_maximum',
          maximum_attenuation_db_per_km: 0.3,
          wavelength_nm: 1550,
        }),
        dispersion: dispersionCheck({
          status: 'fail_below_minimum',
          minimum_dispersion_ps_per_nm_km: 8,
          maximum_dispersion_ps_per_nm_km: 18,
          wavelength_nm: 1550,
        }),
      }),
    )
    const expectedRelation = issue('error', 'Must satisfy n_core > n_cladding.')

    expect(issues.n_core).toEqual([expectedRelation])
    expect(issues.n_cladding).toEqual([expectedRelation])
    expect(issues.core_radius_um).toBeUndefined()
    expect(issues.wavelength_nm).toBeUndefined()
    expect(issues.attenuation_db_per_km).toEqual([
      issue('error', 'G.652.D attenuation must be <= 0.3 dB/km at 1550 nm.'),
    ])
    expect(issues.dispersion_ps_per_nm_km).toEqual([
      issue(
        'error',
        'G.652.D dispersion must be between 8 and 18 ps/(nm·km) at 1550 nm.',
      ),
    ])
  })
})
