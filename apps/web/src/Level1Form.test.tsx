import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  Level1Form,
  type FormValues,
  type NumericFormField,
} from './Level1Form'
import type { FieldIssues } from './fieldIssues'

const values: FormValues = {
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

function renderForm(fieldIssues: FieldIssues = {}) {
  const onNumericFieldChange =
    vi.fn<(field: NumericFormField, value: string) => void>()
  const onPresetChange = vi.fn()
  const onCableApplicationChange = vi.fn()

  render(
    <Level1Form
      values={values}
      error={null}
      fieldIssues={fieldIssues}
      onNumericFieldChange={onNumericFieldChange}
      onPresetChange={onPresetChange}
      onCableApplicationChange={onCableApplicationChange}
    />,
  )

  return {
    onNumericFieldChange,
    onPresetChange,
    onCableApplicationChange,
  }
}

describe('Level1Form inspector accordion', () => {
  afterEach(cleanup)

  test('exposes accessible sections and toggling only changes section state', () => {
    const callbacks = renderForm()
    const sectionNames = ['Preset', 'Fibre', 'Source', 'Section', 'Sampling']

    for (const sectionName of sectionNames) {
      const button = screen.getByRole('button', { name: sectionName })
      const panelId = button.getAttribute('aria-controls')

      expect(panelId).not.toBeNull()
      expect(document.getElementById(panelId ?? '')).toHaveAttribute(
        'role',
        'region',
      )
    }

    const sourceButton = screen.getByRole('button', { name: 'Source' })
    expect(sourceButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(sourceButton)

    expect(sourceButton).toHaveAttribute('aria-expanded', 'true')
    expect(callbacks.onNumericFieldChange).not.toHaveBeenCalled()
    expect(callbacks.onPresetChange).not.toHaveBeenCalled()
    expect(callbacks.onCableApplicationChange).not.toHaveBeenCalled()

    fireEvent.click(sourceButton)
    expect(sourceButton).toHaveAttribute('aria-expanded', 'false')
  })

  test('keeps every existing field and exposes the backend sampling fact', () => {
    renderForm()

    for (const sectionName of ['Source', 'Section', 'Sampling']) {
      fireEvent.click(screen.getByRole('button', { name: sectionName }))
    }

    const fields = [
      ['Fibre preset', 'preset'],
      ['Core refractive index (dimensionless)', 'n_core'],
      ['Cladding refractive index (dimensionless)', 'n_cladding'],
      ['Core radius (µm)', 'core_radius_um'],
      ['Mode-field radius (µm)', 'mode_field_radius_um'],
      ['Attenuation (dB/km)', 'attenuation_db_per_km'],
      ['Dispersion (ps/(nm km))', 'dispersion_ps_per_nm_km'],
      ['Group index (dimensionless)', 'group_index_dimensionless'],
      ['Cable application', 'cable_application'],
      ['Wavelength (nm)', 'wavelength_nm'],
      ['Input power (dBm)', 'input_power_dbm'],
      ['Spectral width FWHM (nm)', 'spectral_width_fwhm_nm'],
      ['Input pulse FWHM (ps)', 'input_pulse_fwhm_ps'],
      ['Section length (km)', 'length_km'],
      ['Grid half-width (µm)', 'grid_half_width_um'],
      ['Grid points (count)', 'grid_points'],
    ]

    for (const [label, name] of fields) {
      expect(screen.getByLabelText(label)).toHaveAttribute('name', name)
    }

    const samplingFact = screen.getByText(
      'Power-series sampling is backend generated; maximum 65 points.',
    )
    expect(samplingFact).toHaveAttribute('role', 'note')
    expect(samplingFact).not.toHaveAttribute('name')
    expect(samplingFact.closest('input, select, textarea')).toBeNull()
  })

  test('changed controls call the existing field callbacks', () => {
    const callbacks = renderForm()

    fireEvent.change(
      screen.getByLabelText('Core refractive index (dimensionless)'),
      { target: { value: '1.475' } },
    )
    fireEvent.change(screen.getByLabelText('Fibre preset'), {
      target: { value: 'g652d' },
    })
    fireEvent.change(screen.getByLabelText('Cable application'), {
      target: { value: 'short_jumper' },
    })

    expect(callbacks.onNumericFieldChange).toHaveBeenCalledWith(
      'n_core',
      '1.475',
    )
    expect(callbacks.onPresetChange).toHaveBeenCalledWith('g652d')
    expect(callbacks.onCableApplicationChange).toHaveBeenCalledWith(
      'short_jumper',
    )
  })

  test('presents error and warning issues on controls and wrappers', () => {
    renderForm({
      n_core: [{ tone: 'error', message: 'Must be greater than cladding.' }],
      wavelength_nm: [
        { tone: 'warning', message: 'Mode count is unavailable.' },
      ],
      cable_application: [
        { tone: 'warning', message: 'Check the selected cable application.' },
        { tone: 'warning', message: 'Attenuation range is limited.' },
      ],
    })

    const coreInput = screen.getByLabelText(
      'Core refractive index (dimensionless)',
    )
    expect(coreInput).toHaveAttribute('aria-invalid', 'true')
    expect(coreInput).toHaveAttribute('aria-describedby', 'n-core-issues')
    expect(coreInput.closest('.level1-inspector-field')).toHaveAttribute(
      'data-tone',
      'error',
    )
    expect(coreInput.closest('.level1-inspector-field')).toHaveClass(
      'level1-inspector-field--error',
    )
    expect(screen.getByText('Must be greater than cladding.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    const wavelengthInput = screen.getByLabelText('Wavelength (nm)')
    expect(wavelengthInput).not.toHaveAttribute('aria-invalid', 'true')
    expect(wavelengthInput).toHaveAttribute(
      'aria-describedby',
      'wavelength-issues',
    )
    expect(wavelengthInput.closest('.level1-inspector-field')).toHaveAttribute(
      'data-tone',
      'warning',
    )
    expect(screen.getByText('Mode count is unavailable.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Section' }))
    const cableSelect = screen.getByLabelText('Cable application')
    expect(cableSelect).not.toHaveAttribute('aria-invalid', 'true')
    expect(cableSelect).toHaveAttribute(
      'aria-describedby',
      'cable-application-issues',
    )
    expect(cableSelect.closest('.level1-inspector-field')).toHaveAttribute(
      'data-tone',
      'warning',
    )
    expect(
      screen.getByText('Check the selected cable application.'),
    ).toBeVisible()
    expect(screen.getByText('Attenuation range is limited.')).toBeVisible()
  })

  test('marks issue-bearing accordion headers without changing their names', () => {
    renderForm({
      n_core: [{ tone: 'error', message: 'Core issue.' }],
      wavelength_nm: [{ tone: 'warning', message: 'Wavelength issue.' }],
      cable_application: [
        { tone: 'warning', message: 'Cable issue one.' },
        { tone: 'warning', message: 'Cable issue two.' },
      ],
    })

    const fibreButton = screen.getByRole('button', { name: 'Fibre' })
    expect(fibreButton).toHaveAttribute('data-tone', 'error')
    expect(fibreButton).toHaveAttribute(
      'aria-describedby',
      'level1-inspector-fibre-heading-issues',
    )
    expect(screen.getByText('Error: 1 issue')).toBeVisible()

    const sourceButton = screen.getByRole('button', { name: 'Source' })
    expect(sourceButton).toHaveAttribute('data-tone', 'warning')
    expect(sourceButton).toHaveAttribute(
      'aria-describedby',
      'level1-inspector-source-heading-issues',
    )
    expect(screen.getByText('Warning: 1 issue')).toBeVisible()

    const sectionButton = screen.getByRole('button', { name: 'Section' })
    expect(sectionButton).toHaveAttribute('data-tone', 'warning')
    expect(screen.getByText('Warning: 2 issues')).toBeVisible()

    for (const sectionName of [
      'Preset',
      'Fibre',
      'Source',
      'Section',
      'Sampling',
    ]) {
      expect(
        screen.getByRole('button', { name: sectionName }),
      ).toBeInTheDocument()
    }
  })
})
