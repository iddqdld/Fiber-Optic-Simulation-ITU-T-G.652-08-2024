import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  Level1Form,
  type FieldBoundaries,
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

const fieldBoundaries: FieldBoundaries = {
  n_core: [
    {
      kind: 'input',
      label: 'Valid input',
      rangeText:
        'finite and > current cladding refractive index (1.465 dimensionless)',
      dependsOn: ['n_cladding'],
      sourceModelId: 'level1_input_validation',
    },
  ],
  core_radius_um: [
    {
      kind: 'model',
      label: 'Ideal single-mode condition',
      rangeText: '0 < core radius < 4.9 µm',
      dependsOn: ['n_core', 'n_cladding', 'wavelength_nm'],
      sourceModelId: 'ideal_single_mode_guidance',
    },
  ],
  wavelength_nm: [
    {
      kind: 'standard',
      label: 'G.652.D limit',
      rangeText: '1260 to 1625 nm inclusive',
      dependsOn: [],
      sourceModelId: 'itu_t_g652d',
    },
  ],
}

function renderForm(
  fieldIssues: FieldIssues = {},
  boundaries: FieldBoundaries = {},
) {
  const onNumericFieldChange =
    vi.fn<(field: NumericFormField, value: string) => void>()
  const onPresetChange = vi.fn()
  const onCableApplicationChange = vi.fn()

  render(
    <Level1Form
      values={values}
      error={null}
      fieldIssues={fieldIssues}
      fieldBoundaries={boundaries}
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

function sectionPanel(sectionName: string): HTMLElement {
  const button = screen.getByRole('button', { name: sectionName })
  const panel = document.getElementById(
    button.getAttribute('aria-controls') ?? '',
  )

  expect(panel).not.toBeNull()
  return panel as HTMLElement
}

function openSection(sectionName: string): void {
  const button = screen.getByRole('button', { name: sectionName })

  if (button.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(button)
  }
}

describe('Level1Form inspector accordion', () => {
  afterEach(cleanup)

  test('uses the exact physical groups and keeps every field in its group', () => {
    renderForm()

    const expectedGroups: Record<string, string[]> = {
      Preset: ['preset'],
      'Fibre geometry': [
        'n_core',
        'n_cladding',
        'core_radius_um',
        'mode_field_radius_um',
      ],
      'Fibre propagation': [
        'group_index_dimensionless',
        'attenuation_db_per_km',
        'dispersion_ps_per_nm_km',
        'cable_application',
      ],
      'Optical source': [
        'wavelength_nm',
        'input_power_dbm',
        'spectral_width_fwhm_nm',
        'input_pulse_fwhm_ps',
      ],
      'Link section': ['length_km'],
      'Numerical sampling': ['grid_half_width_um', 'grid_points'],
    }

    expect(
      screen
        .getAllByRole('button')
        .filter((button) =>
          Object.hasOwn(
            expectedGroups,
            button.getAttribute('aria-label') ?? '',
          ),
        ),
    ).toHaveLength(Object.keys(expectedGroups).length)

    for (const [sectionName, fields] of Object.entries(expectedGroups)) {
      const button = screen.getByRole('button', { name: sectionName })
      const panel = sectionPanel(sectionName)
      const panelFields = Array.from(
        panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
          'input, select',
        ),
      ).map((field) => field.name)

      expect(button).toHaveAttribute('aria-controls', panel.id)
      expect(panel).toHaveAttribute('role', 'region')
      expect(panelFields).toEqual(fields)
    }
  })

  test('keeps Preset and Fibre geometry expanded initially and toggles accessibly', () => {
    const callbacks = renderForm()

    const sectionNames = [
      'Preset',
      'Fibre geometry',
      'Fibre propagation',
      'Optical source',
      'Link section',
      'Numerical sampling',
    ]

    for (const sectionName of sectionNames) {
      const button = screen.getByRole('button', { name: sectionName })
      const expectedExpanded =
        sectionName === 'Preset' || sectionName === 'Fibre geometry'
      expect(button).toHaveAttribute('aria-expanded', String(expectedExpanded))
      expect(sectionPanel(sectionName)).toHaveAttribute('aria-labelledby')
    }

    const sourceButton = screen.getByRole('button', { name: 'Optical source' })
    fireEvent.click(sourceButton)

    expect(sourceButton).toHaveAttribute('aria-expanded', 'true')
    expect(callbacks.onNumericFieldChange).not.toHaveBeenCalled()
    expect(callbacks.onPresetChange).not.toHaveBeenCalled()
    expect(callbacks.onCableApplicationChange).not.toHaveBeenCalled()

    fireEvent.click(sourceButton)
    expect(sourceButton).toHaveAttribute('aria-expanded', 'false')
  })

  test('retains labels, numeric constraints, cable options, preset note, and sampling fact', () => {
    renderForm()

    for (const sectionName of [
      'Fibre propagation',
      'Optical source',
      'Link section',
      'Numerical sampling',
    ]) {
      openSection(sectionName)
    }

    const fields = [
      ['Fibre preset', 'preset'],
      ['Core refractive index (dimensionless)', 'n_core'],
      ['Cladding refractive index (dimensionless)', 'n_cladding'],
      ['Core radius (µm)', 'core_radius_um'],
      ['Mode-field radius (µm)', 'mode_field_radius_um'],
      ['Group index (dimensionless)', 'group_index_dimensionless'],
      ['Attenuation (dB/km)', 'attenuation_db_per_km'],
      ['Dispersion (ps/(nm km))', 'dispersion_ps_per_nm_km'],
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

    expect(screen.getByLabelText('Grid points (count)')).toHaveAttribute(
      'min',
      '3',
    )
    expect(screen.getByLabelText('Grid points (count)')).toHaveAttribute(
      'max',
      '65',
    )
    expect(screen.getByLabelText('Grid points (count)')).toHaveAttribute(
      'step',
      '1',
    )
    expect(screen.getByRole('option', { name: 'Standard cable' })).toBeVisible()
    expect(screen.getByRole('option', { name: 'Short jumper' })).toBeVisible()
    expect(
      screen.getByText('Custom fibre: standards checks are off.'),
    ).toBeVisible()

    const samplingFact = screen.getByText(
      'Power-series sampling is backend generated; maximum 65 points.',
    )
    expect(samplingFact).toHaveAttribute('role', 'note')
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
    openSection('Fibre propagation')
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

  test('aggregates issues with the sections containing their fields', () => {
    renderForm({
      n_core: [{ tone: 'error', message: 'Core issue.' }],
      group_index_dimensionless: [
        { tone: 'warning', message: 'Group index issue.' },
      ],
      cable_application: [{ tone: 'warning', message: 'Cable issue.' }],
      wavelength_nm: [{ tone: 'warning', message: 'Wavelength issue.' }],
      length_km: [{ tone: 'error', message: 'Length issue.' }],
      grid_points: [{ tone: 'warning', message: 'Grid issue.' }],
    })

    const expectedTones = {
      'Fibre geometry': 'error',
      'Fibre propagation': 'warning',
      'Optical source': 'warning',
      'Link section': 'error',
      'Numerical sampling': 'warning',
    }

    for (const [sectionName, tone] of Object.entries(expectedTones)) {
      expect(screen.getByRole('button', { name: sectionName })).toHaveAttribute(
        'data-tone',
        tone,
      )
      expect(sectionPanel(sectionName).closest('section')).toHaveAttribute(
        'data-tone',
        tone,
      )
    }

    expect(screen.getByRole('button', { name: 'Preset' })).not.toHaveAttribute(
      'data-tone',
    )

    openSection('Fibre propagation')
    const groupIndex = screen.getByLabelText('Group index (dimensionless)')
    expect(groupIndex).not.toHaveAttribute('aria-invalid', 'true')
    expect(groupIndex).toHaveAttribute('aria-describedby', 'group-index-issues')
    expect(screen.getByText('Group index issue.')).toBeVisible()
    expect(screen.getByText('Cable issue.')).toBeVisible()

    openSection('Link section')
    expect(screen.getByText('Length issue.')).toBeVisible()
  })

  test('describes supplied boundaries and dependencies without adding issue tone', () => {
    renderForm({}, fieldBoundaries)

    const coreInput = screen.getByLabelText(
      'Core refractive index (dimensionless)',
    )
    expect(coreInput).toHaveAttribute('aria-describedby', 'n-core-boundaries')
    expect(coreInput).not.toHaveAttribute('aria-invalid')
    expect(coreInput.closest('.level1-inspector-field')).not.toHaveAttribute(
      'data-tone',
    )
    expect(coreInput.closest('.level1-inspector-field')).not.toHaveClass(
      'level1-inspector-field--warning',
    )
    expect(screen.getByText('Input')).toBeVisible()
    expect(screen.getByText('Valid input')).toBeVisible()
    expect(
      screen.getByText(
        'finite and > current cladding refractive index (1.465 dimensionless)',
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        'Updates with: Cladding refractive index (dimensionless)',
      ),
    ).toBeVisible()

    openSection('Optical source')
    const wavelength = screen.getByLabelText('Wavelength (nm)')
    expect(wavelength).toHaveAttribute(
      'aria-describedby',
      'wavelength-boundaries',
    )
    expect(screen.getByText('Standard')).toBeVisible()
    expect(screen.getByText('G.652.D limit')).toBeVisible()
    expect(screen.getByText('1260 to 1625 nm inclusive')).toBeVisible()
    expect(wavelength.closest('.level1-inspector-field')).not.toHaveAttribute(
      'data-tone',
    )
    expect(
      within(
        wavelength.closest('.level1-inspector-field') as HTMLElement,
      ).queryByText(/^Updates with:/),
    ).toBeNull()

    const coreRadius = screen.getByLabelText('Core radius (µm)')
    expect(coreRadius).toHaveAttribute(
      'aria-describedby',
      'core-radius-boundaries',
    )
    expect(
      screen.getByText(
        'Updates with: Core refractive index (dimensionless), Cladding refractive index (dimensionless), Wavelength (nm)',
      ),
    ).toBeVisible()
  })

  test('links boundary and issue descriptions while preserving error-only invalid state', () => {
    renderForm(
      {
        n_core: [{ tone: 'error', message: 'Must be greater than cladding.' }],
        wavelength_nm: [
          { tone: 'warning', message: 'Mode count is unavailable.' },
        ],
      },
      fieldBoundaries,
    )

    const coreInput = screen.getByLabelText(
      'Core refractive index (dimensionless)',
    )
    expect(coreInput).toHaveAttribute(
      'aria-describedby',
      'n-core-boundaries n-core-issues',
    )
    expect(coreInput).toHaveAttribute('aria-invalid', 'true')
    expect(coreInput.closest('.level1-inspector-field')).toHaveAttribute(
      'data-tone',
      'error',
    )

    openSection('Optical source')
    const wavelengthInput = screen.getByLabelText('Wavelength (nm)')
    expect(wavelengthInput).toHaveAttribute(
      'aria-describedby',
      'wavelength-boundaries wavelength-issues',
    )
    expect(wavelengthInput).not.toHaveAttribute('aria-invalid', 'true')
    expect(wavelengthInput.closest('.level1-inspector-field')).toHaveAttribute(
      'data-tone',
      'warning',
    )
    expect(screen.getByText('Mode count is unavailable.')).toBeVisible()
  })
})
