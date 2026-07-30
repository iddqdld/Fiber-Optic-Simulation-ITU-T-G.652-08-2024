import { describe, expect, test } from 'vitest'

import {
  initialPandaFieldValues,
  isPandaFieldResult,
  parsePandaFieldValues,
  type PandaFieldFormValues,
  type PandaFieldResult,
} from './pandaFieldModel'

function values(
  overrides: Partial<PandaFieldFormValues> = {},
): PandaFieldFormValues {
  return { ...initialPandaFieldValues, ...overrides }
}

function validResult(): PandaFieldResult {
  const parsed = parsePandaFieldValues(values({ gridPoints: '3' }))
  if (parsed.request === null) {
    throw new Error('Expected valid PANDA defaults')
  }

  const invalid = [null, null, null]
  return {
    configuration: parsed.request,
    x_coordinates_m: [-62.5e-6, 0, 62.5e-6],
    y_coordinates_m: [-62.5e-6, 0, 62.5e-6],
    validity_mask: [
      [false, false, false],
      [false, true, false],
      [false, false, false],
    ],
    normalized_deviatoric_difference_kernel: [
      invalid,
      [null, 1, null],
      invalid,
    ],
    normalized_shear_kernel: [invalid, [null, 0, null], invalid],
    normalized_principal_difference_kernel: [invalid, [null, 1, null], invalid],
    principal_axis_angle_rad: [invalid, [null, 0, null], invalid],
    sap_thermal_mismatch_strains: [0.000767, 0.000767],
    kernel_scale: 0.001,
    warnings: [
      {
        code: 'qualitative_uncalibrated',
        message: 'K_i is undefined and omitted.',
        output_field: 'normalized_deviatoric_difference_kernel',
      },
    ],
    model_manifest: {
      model_id: 'panda_qualitative_far_field_kernel',
      model_version: '1.0.0',
      method: 'qualitative_far_field_kernel',
      quantity_type: 'normalized_dimensionless_kernel',
      normalization: 'max_valid_principal_difference',
      quantitative: false,
      units: '1',
      equation_references: [
        'M1-3.3',
        'M1-5.3',
        'M1-5.4',
        'M1-5.5',
        'M1-5.6',
        'M1-5.7',
      ],
      assumptions: ['constant thermal expansion coefficients'],
      limitations: ['normalized qualitative kernel only'],
      validity: {
        outside_cladding_masked: true,
        sap_interiors_masked: true,
        interface_buffer_m: 2e-6,
        valid_point_count: 1,
      },
    },
  }
}

describe('PANDA field model', () => {
  test('converts user-facing defaults to the SI API request', () => {
    const parsed = parsePandaFieldValues(initialPandaFieldValues)

    expect(parsed.fieldErrors).toEqual({})
    expect(parsed.request).not.toBeNull()
    expect(parsed.request?.geometry.cladding_radius_m).toBeCloseTo(62.5e-6, 16)
    expect(parsed.request?.geometry.sap_1.center_x_m).toBeCloseTo(-30e-6, 16)
    expect(parsed.request?.materials.cladding.cte_per_k).toBeCloseTo(
      0.55e-6,
      16,
    )
    expect(parsed.request?.thermal.temperature_k).toBeCloseTo(293.15, 12)
    expect(parsed.request?.sampling.grid_half_width_m).toBeCloseTo(62.5e-6, 16)
    expect(parsed.request?.materials.sap_1.source.confidence).toBe(
      'demonstration_only',
    )
  })

  test('marks geometric and sampling boundaries on their fields', () => {
    const parsed = parsePandaFieldValues(
      values({
        coreRadiusUm: '70',
        sap1CenterXUm: '60',
        sap2CenterXUm: '60',
        interfaceBufferUm: '-1',
        gridPoints: '64',
      }),
    )

    expect(parsed.request).toBeNull()
    expect(parsed.fieldErrors.coreRadiusUm).toMatch(/smaller|inside/)
    expect(parsed.fieldErrors.sap1CenterXUm).toBeDefined()
    expect(parsed.fieldErrors.sap2CenterXUm).toBeDefined()
    expect(parsed.fieldErrors.interfaceBufferUm).toMatch(/zero or greater/)
    expect(parsed.fieldErrors.gridPoints).toMatch(/odd integer/)
  })

  test('rejects both known zero-normalization input cases before requesting', () => {
    const equalCte = parsePandaFieldValues(
      values({ sap1CteMicroPerK: '0.55', sap2CteMicroPerK: '0.55' }),
    )
    const equalTemperature = parsePandaFieldValues(
      values({ temperatureC: '1200' }),
    )

    expect(equalCte.request).toBeNull()
    expect(equalCte.fieldErrors.sap1CteMicroPerK).toMatch(/must differ/)
    expect(equalTemperature.request).toBeNull()
    expect(equalTemperature.fieldErrors.temperatureC).toMatch(/must differ/)
    expect(equalTemperature.fieldErrors.fictiveTemperatureC).toMatch(
      /must differ/,
    )
  })

  test('accepts the exact qualitative result and rejects unsafe mutations', () => {
    const result = validResult()
    expect(isPandaFieldResult(result)).toBe(true)

    const maskedValue = structuredClone(result)
    maskedValue.normalized_shear_kernel[0][0] = 0
    expect(isPandaFieldResult(maskedValue)).toBe(false)

    const zeroScale = { ...result, kernel_scale: 0 }
    expect(isPandaFieldResult(zeroScale)).toBe(false)

    const outOfRange = structuredClone(result)
    outOfRange.normalized_deviatoric_difference_kernel[1][1] = 1.1
    expect(isPandaFieldResult(outOfRange)).toBe(false)

    const wrongMethod = {
      ...result,
      model_manifest: { ...result.model_manifest, method: 'unverified' },
    }
    expect(isPandaFieldResult(wrongMethod)).toBe(false)
  })
})
