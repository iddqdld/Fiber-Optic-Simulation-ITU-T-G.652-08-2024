import { describe, expect, it, vi } from 'vitest'
import type { FormValues } from './Level1Form'
import {
  downloadFile,
  exportMacrobendLossCsv,
  exportMetricsCsv,
  exportPowerDistanceCsv,
  exportPulseComparisonCsv,
  exportRadialIntensityCsv,
  exportSimulationResultJson,
  parseAndValidateConfiguration,
  serializeConfiguration,
} from './importExport'
import type { PowerDistanceData } from './powerDistancePlot'

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

describe('importExport module', () => {
  it('serializes configuration to valid JSON string and validates it back', () => {
    const jsonString = serializeConfiguration(sampleFormValues)
    expect(jsonString).toContain('g652-simulation-config')

    const result = parseAndValidateConfiguration(jsonString)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.formValues).toEqual(sampleFormValues)
    }
  })

  it('rejects invalid JSON syntax when parsing configuration', () => {
    const result = parseAndValidateConfiguration('{ invalid json syntax')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Invalid JSON format')
    }
  })

  it('rejects configuration with missing required fields', () => {
    const incompleteConfig = JSON.stringify({
      version: '1.0',
      type: 'g652-simulation-config',
      exportedAt: new Date().toISOString(),
      formValues: {
        preset: 'standard_smf',
        n_core: '1.47',
      },
    })

    const result = parseAndValidateConfiguration(incompleteConfig)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Missing or invalid required field')
    }
  })

  it('rejects configuration with unsupported type or version', () => {
    const invalidTypeConfig = JSON.stringify({
      version: '1.0',
      type: 'other-type',
      formValues: sampleFormValues,
    })

    const result = parseAndValidateConfiguration(invalidTypeConfig)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Unrecognized configuration file type')
    }
  })

  it('exports simulation result JSON string correctly', () => {
    const mockPreviewResult = {
      guidance: {
        v_number_dimensionless: 2.14,
        numerical_aperture_dimensionless: 0.12,
      },
      attenuation: {
        section_loss_db: 2.5,
        output_power_dbm: -5.5,
      },
      pulse_broadening: {
        accumulated_dispersion_ps_per_nm: 212.5,
        dispersion_broadening_fwhm_ps: 4.2,
        output_pulse_fwhm_ps: 25.35,
      },
      standards_checks: {
        attenuation: { status: 'pass', maximum_attenuation_db_per_km: 0.4 },
        dispersion: { status: 'pass', maximum_dispersion_ps_per_nm_km: 18.0 },
      },
      parameter_boundaries: [],
      warnings: [],
      mode_profile: {
        mode_field_radius_um: 4.6,
        radius_um: [0, 1, 2],
        normalized_intensity: [1.0, 0.8, 0.5],
        electric_field: [1.0, 0.89, 0.71],
      },
      macrobend_loss: null,
    } as const

    const jsonString = exportSimulationResultJson(mockPreviewResult as never)
    expect(jsonString).toContain('g652-simulation-result')
    expect(jsonString).toContain('"section_loss_db": 2.5')
  })

  it('exports metrics CSV containing input parameters and calculated metrics', () => {
    const mockPreviewResult = {
      guidance: {
        v_number_dimensionless: 2.14,
        numerical_aperture_dimensionless: 0.12,
      },
      attenuation: {
        section_loss_db: 2.5,
        output_power_dbm: -5.5,
      },
      pulse_broadening: {
        accumulated_dispersion_ps_per_nm: 212.5,
        dispersion_broadening_fwhm_ps: 4.2,
        output_pulse_fwhm_ps: 25.35,
      },
      standards_checks: {
        attenuation: { status: 'pass', maximum_attenuation_db_per_km: 0.4 },
        dispersion: { status: 'pass', maximum_dispersion_ps_per_nm_km: 18.0 },
      },
      parameter_boundaries: [],
      warnings: [],
      mode_profile: {
        mode_field_radius_um: 4.6,
        radius_um: [0, 1, 2],
        normalized_intensity: [1.0, 0.8, 0.5],
        electric_field: [1.0, 0.89, 0.71],
      },
      macrobend_loss: null,
    } as const

    const csvContent = exportMetricsCsv(
      mockPreviewResult as never,
      sampleFormValues,
    )
    expect(csvContent).toContain(
      'Category,Parameter / Metric,Value,Unit,Details / Compliance',
    )
    expect(csvContent).toContain('Input,Preset,g652d')
    expect(csvContent).toContain('Calculated Metric,V Parameter,2.14')
    expect(csvContent).toContain('Standard Check,Attenuation Standard,PASS')
  })

  it('exports power distance CSV correctly', () => {
    const mockPowerDistanceData: PowerDistanceData = {
      lengthKm: 10,
      attenuationDbPerKm: 0.2,
      inputPowerDbm: 0,
      sectionLossDb: 2,
      outputPowerDbm: -2,
      distanceSamplesKm: [0, 5, 10],
      powerSamplesDbm: [0, -1, -2],
      modelId: 'constant_fibre_attenuation',
      modelVersion: '1.0.0',
    }

    const csvContent = exportPowerDistanceCsv(mockPowerDistanceData)
    expect(csvContent).toContain('Distance (km),Power (dBm),Power (mW)')
    expect(csvContent).toContain('0,0,1.000000')
    expect(csvContent).toContain('10,-2,0.630957')
  })

  it('exports radial intensity CSV correctly', () => {
    const mockModeProfile = {
      radius_um: [0, 2.5, 5],
      normalized_intensity: [1.0, 0.75, 0.1],
      electric_field: [1.0, 0.866, 0.316],
    }

    const csvContent = exportRadialIntensityCsv(mockModeProfile as never)
    expect(csvContent).toContain(
      'Radius (µm),Normalized Intensity,Electric Field Amplitude',
    )
    expect(csvContent).toContain('0,1,1')
    expect(csvContent).toContain('2.5,0.75,0.866')
  })

  it('exports pulse comparison CSV correctly', () => {
    const mockPulseData = {
      lengthKm: 10,
      dispersionPsPerNmKm: 17,
      spectralWidthFwhmNm: 0.2,
      inputPulseFwhmPs: 25,
      accumulatedDispersionPsPerNm: 170,
      dispersionBroadeningFwhmPs: 5,
      outputPulseFwhmPs: 25.5,
      modelId: 'first_order_chromatic_pulse_broadening',
      modelVersion: '1.0.0',
      widthConvention: 'fwhm',
      inputProfile: [
        { timePs: -10, normalizedTime: -1, normalizedValue: 0.5 },
        { timePs: 0, normalizedTime: 0, normalizedValue: 1.0 },
      ],
      outputProfile: [
        { timePs: -10, normalizedTime: -1, normalizedValue: 0.4 },
        { timePs: 0, normalizedTime: 0, normalizedValue: 0.9 },
      ],
    }

    const csvContent = exportPulseComparisonCsv(mockPulseData as never)
    expect(csvContent).toContain(
      'Time (ps),Input Pulse Intensity,Output Pulse Intensity',
    )
    expect(csvContent).toContain('0,1,1')
    expect(csvContent).toContain('-12.5,0.5,0.5')
  })

  it('exports macrobend loss CSV correctly', () => {
    const mockMacrobendResult = {
      bends: [
        {
          angle_deg: 90,
          position_fraction: 0.5,
          radius_mm: 15,
          supplied_loss_db: 0.05,
          cumulative_bend_loss_db: 0.05,
          output_power_dbm: -3.05,
        },
      ],
      input_power_dbm: -3,
      output_power_dbm: -3.05,
      total_bend_loss_db: 0.05,
      model_manifest: {
        model_name: 'test',
        model_version: '1.0.0',
      },
    }

    const csvContent = exportMacrobendLossCsv(mockMacrobendResult as never)
    expect(csvContent).toContain(
      'Bend #,Position Fraction,Radius (mm),Angle (deg)',
    )
    expect(csvContent).toContain('1,0.5,15,90,0.05,0.05,-3.05')
  })

  it('triggers file download without throwing', () => {
    const createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-url')
    const revokeObjectURLSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {})

    expect(() => {
      downloadFile('test.json', '{"test": true}', 'application/json')
    }).not.toThrow()

    expect(createObjectURLSpy).toHaveBeenCalled()
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')

    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })
})
