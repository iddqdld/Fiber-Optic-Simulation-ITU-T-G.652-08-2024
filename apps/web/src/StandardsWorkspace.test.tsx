import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import type { operations } from '../../../packages/shared_schemas/generated/api'
import { StandardsWorkspace } from './StandardsWorkspace'

afterEach(cleanup)

type PreviewResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']
type StandardsChecks = PreviewResult['standards_checks']

const customChecks = {
  preset: 'custom',
  preset_definition: null,
  attenuation: null,
  dispersion: null,
} satisfies StandardsChecks

const g652dChecks = {
  preset: 'g652d',
  preset_definition: {
    standard_name: 'ITU-T G.652',
    standard_edition: '08/2024',
    fibre_category: 'G.652.D',
    preset_id: 'g652d_2024',
    model_id: 'itu_t_g652d_preset',
    model_version: '1.0.0',
    source_references: ['ITU-T G.652 (08/2024), Table 2'],
    assumptions: [],
    limitations: ['Not complete G.652.D conformance.'],
  },
  attenuation: {
    status: 'pass',
    wavelength_nm: 1550,
    supplied_attenuation_db_per_km: 0.275,
    maximum_attenuation_db_per_km: 0.3,
    margin_below_maximum_db_per_km: 0.025,
    limit_band: 'c_band_1530_1565',
    cable_application: 'standard_cable',
    not_applicable_reason: null,
    model_manifest: {
      model_id: 'itu_t_g652d_attenuation_check',
      model_version: '1.0.0',
      standard_name: 'ITU-T G.652',
      standard_edition: '08/2024',
      fibre_category: 'G.652.D',
      comparison_rule: 'inclusive_maximum',
      assumptions: [],
      limitations: [],
    },
  },
  dispersion: {
    status: 'pass',
    wavelength_nm: 1550,
    supplied_dispersion_ps_per_nm_km: 17,
    minimum_dispersion_ps_per_nm_km: 13.3,
    maximum_dispersion_ps_per_nm_km: 18.6,
    margin_above_minimum_ps_per_nm_km: 3.7,
    margin_below_maximum_ps_per_nm_km: 1.6,
    fit_region: 'linear',
    model_manifest: {
      model_id: 'itu_t_g652d_chromatic_dispersion_check',
      model_version: '1.0.0',
      standard_name: 'ITU-T G.652',
      standard_edition: '08/2024',
      fibre_category: 'G.652.D',
      comparison_rule: 'inclusive_envelope',
      envelope_model_id: 'itu_t_g652d_chromatic_dispersion_envelope',
      envelope_model_version: '1.0.0',
      assumptions: [],
      limitations: [],
    },
  },
} as StandardsChecks

describe('StandardsWorkspace', () => {
  test('explains that custom checks are not applicable', () => {
    render(<StandardsWorkspace standardsChecks={customChecks} />)

    expect(screen.getByText('Custom')).toBeVisible()
    expect(screen.getAllByText('Not applicable')).toHaveLength(2)
    expect(
      screen.getByText(/Select the G\.652\.D preset to compare attenuation/),
    ).toBeVisible()
  })

  test('shows exact represented G.652.D values, sources, and limitations', () => {
    render(<StandardsWorkspace standardsChecks={g652dChecks} />)

    const attenuation = screen
      .getByRole('heading', { name: 'Attenuation' })
      .closest('article')
    const dispersion = screen
      .getByRole('heading', { name: 'Chromatic dispersion' })
      .closest('article')

    expect(attenuation).not.toBeNull()
    expect(dispersion).not.toBeNull()
    expect(within(attenuation!).getByText('0.275 dB/km')).toBeVisible()
    expect(within(attenuation!).getByText('0.3 dB/km')).toBeVisible()
    expect(within(dispersion!).getByText('13.3–18.6 ps/(nm·km)')).toBeVisible()
    expect(screen.getAllByText('Pass')).toHaveLength(2)
    expect(screen.getByText('ITU-T G.652 (08/2024), Table 2')).toBeVisible()
    expect(
      screen.getByText(/not a complete product conformance determination/i),
    ).toBeVisible()
  })
})
