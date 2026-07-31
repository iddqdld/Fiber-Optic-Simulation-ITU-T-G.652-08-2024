import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FormValues } from './Level1Form'
import { ImportExportModal } from './ImportExportModal'
import * as importExportModule from './importExport'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const sampleFormValues: FormValues = {
  preset: 'g652d',
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

describe('ImportExportModal component', () => {

  it('renders import and export buttons', () => {
    const handleImportConfig = vi.fn()
    render(
      <ImportExportModal
        formValues={sampleFormValues}
        onImportConfig={handleImportConfig}
        previewResult={null}
      />,
    )

    expect(screen.getByText('Import JSON')).toBeInTheDocument()
    expect(screen.getByText('Export JSON')).toBeInTheDocument()
    expect(screen.getByText('Export Results')).toBeInTheDocument()
  })

  it('calls downloadFile when clicking Export JSON', () => {
    const downloadSpy = vi
      .spyOn(importExportModule, 'downloadFile')
      .mockImplementation(() => {})
    const handleImportConfig = vi.fn()

    render(
      <ImportExportModal
        formValues={sampleFormValues}
        onImportConfig={handleImportConfig}
        previewResult={null}
      />,
    )

    fireEvent.click(screen.getByText('Export JSON'))

    expect(downloadSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^g652_config_.*\.json$/),
      expect.stringContaining('g652-simulation-config'),
      'application/json',
    )
  })

  it('opens and closes export results modal', () => {
    const handleImportConfig = vi.fn()
    render(
      <ImportExportModal
        formValues={sampleFormValues}
        onImportConfig={handleImportConfig}
        previewResult={null}
      />,
    )

    fireEvent.click(screen.getByText('Export Results'))
    expect(screen.getByText('Export Simulation Results')).toBeInTheDocument()
    expect(
      screen.getByText('No simulation results available yet. Run a simulation preview first.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByText('Close'))
    expect(screen.queryByText('Export Simulation Results')).not.toBeInTheDocument()
  })

})
