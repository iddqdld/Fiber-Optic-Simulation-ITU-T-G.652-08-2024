import { describe, expect, test } from 'vitest'

import type { components } from '../../../packages/shared_schemas/generated/api'
import {
  SWEEP_METRIC_DEFINITIONS,
  SWEEP_PARAMETER_DEFINITIONS,
  formatSweepNumber,
  getCurrentSweepParameterValue,
  getSweepErrorMessage,
  getSweepMetricDefinition,
  getSweepParameterDefinition,
  getSweepSeries,
  isSweepResult,
  parseSweepRequest,
  type SweepBaseConfiguration,
  type SweepRequest,
  type SweepResult,
} from './sweep'

const customConfiguration = {
  preset: 'custom',
  fibre: {
    n_core: 1.47,
    n_cladding: 1.465,
    core_radius_um: 4.1,
    mode_field_radius_um: 4.8,
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
  section: { length_km: 12 },
  sampling: { grid_half_width_um: 15, grid_points: 5 },
} satisfies SweepBaseConfiguration

const g652dConfiguration = {
  ...customConfiguration,
  preset: 'g652d',
  fibre: {
    ...customConfiguration.fibre,
    cable_application: 'indoor_cable',
  },
} satisfies SweepBaseConfiguration

const request = {
  base_configuration: customConfiguration,
  parameter: 'core_radius_um',
  start_value: 3.5,
  stop_value: 4.5,
  sample_count: 3,
} satisfies SweepRequest

function makePoint(
  parameterValue: number,
  overrides: Partial<SweepResult['points'][number]> = {},
): SweepResult['points'][number] {
  return {
    approximate_mode_count: null,
    attenuation_standard_status: null,
    dispersion_broadening_fwhm_ps: 2,
    dispersion_standard_status: null,
    group_delay_ps: 3,
    mode_regime: 'single_mode',
    numerical_aperture_dimensionless: 0.12,
    output_power_dbm: -4,
    output_pulse_fwhm_ps: 26,
    parameter_value: parameterValue,
    section_loss_db: 1,
    v_number_dimensionless: 2,
    warning_codes: [],
    ...overrides,
  }
}

function makeResult(
  resultRequest: SweepRequest = request,
  points: SweepResult['points'] = [
    makePoint(resultRequest.start_value),
    makePoint((resultRequest.start_value + resultRequest.stop_value) / 2),
    makePoint(resultRequest.stop_value),
  ],
): SweepResult {
  return {
    model_manifest: {
      assumptions: ['independent deterministic evaluations'],
      component_model_id: 'level1_single_section_simulation',
      limitations: ['no interpolation'],
      max_sample_count: 200,
      model_id: 'level1_one_parameter_sweep',
      model_version: '1.0.0',
      spacing: 'linear',
    },
    parameter_unit:
      getSweepParameterDefinition(resultRequest.parameter)?.unit ??
      'dimensionless',
    points,
    request: resultRequest,
  }
}

function cloneResult(result: SweepResult): SweepResult {
  return structuredClone(result)
}

describe('sweep definitions', () => {
  test('defines all backend parameters in backend order with exact units', () => {
    expect(
      SWEEP_PARAMETER_DEFINITIONS.map(({ parameter, label, unit }) => ({
        parameter,
        label,
        unit,
      })),
    ).toEqual([
      {
        parameter: 'n_core',
        label: 'Core refractive index',
        unit: 'dimensionless',
      },
      {
        parameter: 'n_cladding',
        label: 'Cladding refractive index',
        unit: 'dimensionless',
      },
      { parameter: 'core_radius_um', label: 'Core radius', unit: 'µm' },
      {
        parameter: 'attenuation_db_per_km',
        label: 'Attenuation',
        unit: 'dB/km',
      },
      {
        parameter: 'dispersion_ps_per_nm_km',
        label: 'Dispersion',
        unit: 'ps/(nm·km)',
      },
      {
        parameter: 'group_index_dimensionless',
        label: 'Group index',
        unit: 'dimensionless',
      },
      { parameter: 'wavelength_nm', label: 'Wavelength', unit: 'nm' },
      { parameter: 'input_power_dbm', label: 'Input power', unit: 'dBm' },
      {
        parameter: 'spectral_width_fwhm_nm',
        label: 'Spectral width FWHM',
        unit: 'nm',
      },
      {
        parameter: 'input_pulse_fwhm_ps',
        label: 'Input pulse FWHM',
        unit: 'ps',
      },
      { parameter: 'length_km', label: 'Section length', unit: 'km' },
    ])

    const values = [
      customConfiguration.fibre.n_core,
      customConfiguration.fibre.n_cladding,
      customConfiguration.fibre.core_radius_um,
      customConfiguration.fibre.attenuation_db_per_km,
      customConfiguration.fibre.dispersion_ps_per_nm_km,
      customConfiguration.fibre.group_index_dimensionless,
      customConfiguration.source.wavelength_nm,
      customConfiguration.source.input_power_dbm,
      customConfiguration.source.spectral_width_fwhm_nm,
      customConfiguration.source.input_pulse_fwhm_ps,
      customConfiguration.section.length_km,
    ]

    expect(
      SWEEP_PARAMETER_DEFINITIONS.map((definition) =>
        definition.getValue(customConfiguration),
      ),
    ).toEqual(values)
  })

  test('looks up definitions and current nested parameter values', () => {
    for (const definition of SWEEP_PARAMETER_DEFINITIONS) {
      expect(getSweepParameterDefinition(definition.parameter)).toBe(definition)
      expect(
        getCurrentSweepParameterValue(
          customConfiguration,
          definition.parameter,
        ),
      ).toBe(definition.getValue(customConfiguration))
    }

    expect(getSweepParameterDefinition('unknown' as never)).toBeUndefined()
  })

  test('defines all metrics in display order with point getters and units', () => {
    const point = makePoint(1, {
      numerical_aperture_dimensionless: 0.13,
      v_number_dimensionless: 2.2,
      section_loss_db: 1.1,
      output_power_dbm: -5,
      group_delay_ps: 4,
      dispersion_broadening_fwhm_ps: 6,
      output_pulse_fwhm_ps: 7,
    })

    expect(
      SWEEP_METRIC_DEFINITIONS.map(({ id, label, unit }) => ({
        id,
        label,
        unit,
      })),
    ).toEqual([
      {
        id: 'numerical-aperture',
        label: 'Numerical aperture',
        unit: 'dimensionless',
      },
      { id: 'v-number', label: 'V-number', unit: 'dimensionless' },
      { id: 'section-loss', label: 'Section loss', unit: 'dB' },
      { id: 'output-power', label: 'Output power', unit: 'dBm' },
      { id: 'group-delay', label: 'Group delay', unit: 'ps' },
      {
        id: 'dispersion-broadening-fwhm',
        label: 'Dispersion broadening FWHM',
        unit: 'ps',
      },
      { id: 'output-pulse-fwhm', label: 'Output pulse FWHM', unit: 'ps' },
    ])

    expect(
      SWEEP_METRIC_DEFINITIONS.map((definition) => definition.getValue(point)),
    ).toEqual([0.13, 2.2, 1.1, -5, 4, 6, 7])

    for (const definition of SWEEP_METRIC_DEFINITIONS) {
      expect(getSweepMetricDefinition(definition.id)).toBe(definition)
    }

    expect(getSweepMetricDefinition('unknown' as never)).toBeUndefined()
  })
})

describe('parseSweepRequest', () => {
  test('parses valid boundaries without applying endpoint physics', () => {
    expect(
      parseSweepRequest(customConfiguration, 'n_core', '-2', '2', '2'),
    ).toEqual({
      success: true,
      request: {
        base_configuration: customConfiguration,
        parameter: 'n_core',
        start_value: -2,
        stop_value: 2,
        sample_count: 2,
      },
    })
    expect(
      parseSweepRequest(customConfiguration, 'length_km', '0', '0.1', '200')
        .success,
    ).toBe(true)
  })

  test('rejects missing, empty, nonfinite, and reversed endpoints', () => {
    expect(parseSweepRequest(null, 'n_core', '1', '2', '3')).toEqual({
      success: false,
      error: 'a valid base configuration is required',
    })
    expect(
      parseSweepRequest(customConfiguration, 'n_core', '', '2', '3').success,
    ).toBe(false)
    expect(
      parseSweepRequest(customConfiguration, 'n_core', '1', 'Infinity', '3')
        .success,
    ).toBe(false)
    expect(
      parseSweepRequest(customConfiguration, 'n_core', '2', '2', '3').success,
    ).toBe(false)
    expect(
      parseSweepRequest(customConfiguration, 'n_core', '3', '2', '3').success,
    ).toBe(false)
  })

  test('requires strict decimal integer count text and enforces 2..200', () => {
    for (const text of ['', '1.0', '2.5', '2e1', '0x10', ' 3', '3 ']) {
      expect(
        parseSweepRequest(customConfiguration, 'n_core', '1', '2', text)
          .success,
      ).toBe(false)
    }

    expect(
      parseSweepRequest(customConfiguration, 'n_core', '1', '2', '1').success,
    ).toBe(false)
    expect(
      parseSweepRequest(customConfiguration, 'n_core', '1', '2', '201').success,
    ).toBe(false)
    expect(
      parseSweepRequest(customConfiguration, 'n_core', '1', '2', '02'),
    ).toMatchObject({
      success: true,
      request: { sample_count: 2 },
    })
  })
})

describe('isSweepResult', () => {
  test('accepts complete custom and G.652.D results', () => {
    expect(isSweepResult(makeResult(), request)).toBe(true)

    const g652dRequest: SweepRequest = {
      ...request,
      base_configuration: g652dConfiguration,
      parameter: 'wavelength_nm',
      start_value: 1310,
      stop_value: 1550,
      sample_count: 2,
    }
    const g652dResult = makeResult(g652dRequest, [
      makePoint(1310, {
        attenuation_standard_status: 'pass',
        dispersion_standard_status: 'pass',
        mode_regime: 'multimode',
        warning_codes: ['g652d_attenuation_not_applicable'],
        approximate_mode_count: 3,
      }),
      makePoint(1550, {
        attenuation_standard_status: 'fail_above_maximum',
        dispersion_standard_status: 'fail_above_maximum',
        mode_regime: 'multimode',
        warning_codes: ['mode_count_unavailable'],
        approximate_mode_count: 3.5,
      }),
    ])

    expect(isSweepResult(g652dResult, g652dRequest)).toBe(true)
  })

  test('rejects malformed fields, enums, manifests, requests, points, and extras', () => {
    const cases: Array<(result: SweepResult) => void> = [
      (result) => {
        result.parameter_unit = 'km'
      },
      (result) => {
        result.model_manifest.model_id = 'stale' as never
      },
      (result) => {
        result.model_manifest.model_version = '2.0.0' as never
      },
      (result) => {
        result.model_manifest.spacing = 'log' as never
      },
      (result) => {
        result.model_manifest.max_sample_count = 100 as never
      },
      (result) => {
        result.model_manifest.assumptions = [1] as never
      },
      (result) => {
        result.model_manifest.limitations = ['ok', 1] as never
      },
      (result) => {
        result.request.parameter = 'bad' as never
      },
      (result) => {
        result.request.sample_count = 4
      },
      (result) => {
        result.points[0].mode_regime = 'unknown' as never
      },
      (result) => {
        result.points[0].attenuation_standard_status = 'unknown' as never
      },
      (result) => {
        result.points[0].dispersion_standard_status = 'unknown' as never
      },
      (result) => {
        result.points[0].warning_codes = ['unknown'] as never
      },
      (result) => {
        result.points[0].approximate_mode_count = Number.NaN
      },
      (result) => {
        result.points[0].group_delay_ps = Number.POSITIVE_INFINITY
      },
      (result) => {
        result.points[0].parameter_value = Number.NaN
      },
      (result) => {
        result.points[1].parameter_value = result.points[0].parameter_value
      },
      (result) => {
        result.points[0].parameter_value = request.start_value + 0.1
      },
      (result) => {
        result.points[result.points.length - 1].parameter_value =
          request.stop_value - 0.1
      },
      (result) => {
        result.points.pop()
      },
      (result) => {
        ;(result as unknown as Record<string, unknown>).extra = true
      },
      (result) => {
        ;(result.points[0] as unknown as Record<string, unknown>).extra = true
      },
      (result) => {
        ;(result.request as unknown as Record<string, unknown>).extra = true
      },
    ]

    for (const mutate of cases) {
      const malformed = cloneResult(makeResult())
      mutate(malformed)
      expect(isSweepResult(malformed, request)).toBe(false)
    }
  })

  test('rejects every request mismatch and malformed base configuration', () => {
    const mismatchCases: SweepRequest[] = [
      { ...request, parameter: 'n_core' },
      { ...request, start_value: 3 },
      { ...request, stop_value: 5 },
      { ...request, sample_count: 2 },
      {
        ...request,
        base_configuration: {
          ...request.base_configuration,
          preset: 'g652d',
        },
      },
    ]

    for (const mismatchedRequest of mismatchCases) {
      expect(isSweepResult(makeResult(), mismatchedRequest)).toBe(false)
    }

    const malformedBase = cloneResult(makeResult())
    ;(
      malformedBase.request.base_configuration.fibre as Record<string, unknown>
    ).extra = true
    expect(isSweepResult(malformedBase, request)).toBe(false)
  })
})

describe('sweep errors and series', () => {
  test('prefers the first structured validation detail over the stable error', () => {
    expect(
      getSweepErrorMessage({
        error: {
          message: 'stable API message',
          details: {
            errors: [{ msg: 'first detail' }, { msg: 'second detail' }],
          },
        },
      }),
    ).toBe('first detail')
    expect(
      getSweepErrorMessage({
        error: {
          message: 'stable API message',
          details: { reason: 'runtime' },
        },
      }),
    ).toBe('stable API message')
    expect(getSweepErrorMessage({ error: { message: '' } })).toBeNull()
  })

  test('preserves exact samples and raw zero-span domains without mutation', () => {
    const result = makeResult(request, [
      makePoint(3.5, { output_power_dbm: -4.25 }),
      makePoint(4, { output_power_dbm: -4.25 }),
      makePoint(4.5, { output_power_dbm: -4.25 }),
    ])
    const before = structuredClone(result)

    expect(getSweepSeries(result, 'output-power')).toEqual({
      points: [
        { x: 3.5, y: -4.25 },
        { x: 4, y: -4.25 },
        { x: 4.5, y: -4.25 },
      ],
      xDomain: [3.5, 4.5],
      yDomain: [-4.25, -4.25],
    })
    expect(result).toEqual(before)
  })

  test('formats values deterministically without negative zero', () => {
    expect(formatSweepNumber(0)).toBe('0')
    expect(formatSweepNumber(-0)).toBe('0')
    expect(formatSweepNumber(1.2)).toBe('1.2')
    expect(formatSweepNumber(123.456789)).toBe('123.457')
    expect(formatSweepNumber(1_000_000)).toBe('1e+6')
    expect(formatSweepNumber(-0.00000012345)).toBe('-1.2345e-7')
    expect(formatSweepNumber(Number.MAX_VALUE)).toBe('1.79769e+308')
    expect(formatSweepNumber(Number.MIN_VALUE)).toBe('4.94066e-324')
  })

  test('does not mutate configuration or definitions', () => {
    const configurationBefore = structuredClone(customConfiguration)
    const definitionsBefore = SWEEP_PARAMETER_DEFINITIONS.map((definition) => ({
      parameter: definition.parameter,
      label: definition.label,
      unit: definition.unit,
    }))

    getCurrentSweepParameterValue(customConfiguration, 'n_core')
    getSweepParameterDefinition('n_core')?.getValue(customConfiguration)

    expect(customConfiguration).toEqual(configurationBefore)
    expect(
      SWEEP_PARAMETER_DEFINITIONS.map(({ parameter, label, unit }) => ({
        parameter,
        label,
        unit,
      })),
    ).toEqual(definitionsBefore)
  })
})

describe('schema aliases remain tied to generated API types', () => {
  test('uses generated component names for fixture typing', () => {
    const schemaConfiguration: components['schemas']['Level1SimulationRequest'] =
      customConfiguration
    expect(schemaConfiguration).toBe(customConfiguration)
  })
})
