import { describe, expect, test } from 'vitest'

import type { components } from '../../../packages/shared_schemas/generated/api'
import {
  isMacrobendLossResult,
  isMacrobendSequence,
  macrobendInputsMatch,
} from './macrobend'

type MacrobendInput = components['schemas']['MacrobendInput']
type MacrobendLossPoint = components['schemas']['MacrobendLossPoint']
type MacrobendLossResult = components['schemas']['MacrobendLossResult']

const DB_PER_NEPER_POWER = 10 / Math.log(10)

const manifest = {
  assumptions: [
    'weakly guiding equivalent step-index fibre',
    'scalar LP01 mode and circular transverse index model',
    'idealized infinite or absorbing cladding treatment',
    'constant curvature within each configured bend',
  ],
  limitations: [
    'analytical engineering estimate, not measured manufacturer bend-loss data',
    'no coating, cable jacket, microbend, or cladding-coating recoupling model',
    'no full-vector bent mode, polarization coupling, or bend stress-optic model',
    'no abrupt bend-transition mode-mismatch loss',
    'not a G.652 compliance certificate',
  ],
  loss_source: 'calculated',
  model_id: 'marcuse_lp01_step_index_macrobend',
  model_version: '1.0.0',
  path_model: 'piecewise_constant_curvature',
  references: [
    'D. Marcuse, JOSA 66(3), 216-220 (1976), DOI 10.1364/JOSA.66.000216',
    'D. Marcuse, JOSA 66(4), 311-320 (1976), DOI 10.1364/JOSA.66.000311',
  ],
  scientific_label: 'Estimated LP01 macrobend radiation loss — Marcuse model',
} satisfies components['schemas']['MacrobendLossManifest']

function bend(
  positionFraction: number,
  overrides: Partial<MacrobendInput> = {},
): MacrobendInput {
  return {
    angle_deg: 90,
    direction: 'left',
    position_fraction: positionFraction,
    radius_mm: 12,
    ...overrides,
  }
}

function makePoint(
  input: MacrobendInput,
  alphaPowerPerM: number,
  inputPowerDbm: number,
  cumulativeBendLossDb: number,
): MacrobendLossPoint {
  const bendLengthM =
    input.radius_mm * 1e-3 * ((input.angle_deg * Math.PI) / 180)
  const localLossDbPerM = DB_PER_NEPER_POWER * alphaPowerPerM

  return {
    alpha_power_per_m: alphaPowerPerM,
    angle_deg: input.angle_deg,
    bend_length_m: bendLengthM,
    cumulative_bend_loss_db: cumulativeBendLossDb,
    direction: input.direction,
    estimated_radiation_loss_db: localLossDbPerM * bendLengthM,
    local_loss_db_per_m: localLossDbPerM,
    numerical_underflow: false,
    output_power_dbm: inputPowerDbm - cumulativeBendLossDb,
    position_fraction: input.position_fraction,
    radius_mm: input.radius_mm,
    validity: 'valid',
    warnings: [],
  }
}

function result(): MacrobendLossResult {
  const inputPowerDbm = -5.5
  const inputs = [bend(0.2), bend(0.7, { direction: 'right', radius_mm: 18 })]
  const firstPointBase = makePoint(inputs[0], 0.8, inputPowerDbm, 0)
  const firstPoint = {
    ...firstPointBase,
    cumulative_bend_loss_db: firstPointBase.estimated_radiation_loss_db,
    output_power_dbm:
      inputPowerDbm - firstPointBase.estimated_radiation_loss_db,
  }
  const secondPointBase = makePoint(
    inputs[1],
    1.2,
    inputPowerDbm,
    firstPoint.estimated_radiation_loss_db,
  )
  const secondPoint = {
    ...secondPointBase,
    cumulative_bend_loss_db:
      firstPoint.estimated_radiation_loss_db +
      secondPointBase.estimated_radiation_loss_db,
    output_power_dbm:
      inputPowerDbm -
      firstPoint.estimated_radiation_loss_db -
      secondPointBase.estimated_radiation_loss_db,
  }
  const bends = [firstPoint, secondPoint]
  const totalBendLossDb = bends.reduce(
    (total, point) => total + point.estimated_radiation_loss_db,
    0,
  )

  return {
    beta_per_m: 5_950_000,
    beta_source: 'scalar_step_index_lp01',
    bends,
    cladding_radius_m: null,
    core_radius_m: 4.1e-6,
    input_power_dbm: inputPowerDbm,
    max_local_loss_db_per_m: Math.max(
      ...bends.map((point) => point.local_loss_db_per_m),
    ),
    minimum_bend_radius_m: 0.012,
    model_manifest: manifest,
    n_cladding: 1.465,
    n_core: 1.47,
    numerical_underflow: false,
    output_power_dbm: inputPowerDbm - totalBendLossDb,
    total_bend_loss_db: totalBendLossDb,
    total_bent_length_m: bends.reduce(
      (total, point) => total + point.bend_length_m,
      0,
    ),
    validity: 'valid',
    warnings: [],
    wavelength_m: 1.55e-6,
  }
}

function emptyResult(): MacrobendLossResult {
  return {
    beta_per_m: 5_950_000,
    beta_source: 'scalar_step_index_lp01',
    bends: [],
    cladding_radius_m: null,
    core_radius_m: 4.1e-6,
    input_power_dbm: -5.5,
    max_local_loss_db_per_m: 0,
    minimum_bend_radius_m: null,
    model_manifest: manifest,
    n_cladding: 1.465,
    n_core: 1.47,
    numerical_underflow: false,
    output_power_dbm: -5.5,
    total_bend_loss_db: 0,
    total_bent_length_m: 0,
    validity: 'valid',
    warnings: [],
    wavelength_m: 1.55e-6,
  }
}

describe('macrobend contract validation', () => {
  test('accepts the four-field bend input and ordered sequences', () => {
    expect(isMacrobendSequence([])).toBe(true)
    expect(isMacrobendSequence([bend(0.2), bend(0.7)])).toBe(true)
    expect(
      isMacrobendSequence([
        { ...bend(0.4), supplied_loss_db: 0.2 } as unknown as MacrobendInput,
      ]),
    ).toBe(false)
  })

  test('rejects duplicate positions, invalid fields, extras, and more than 32 bends', () => {
    expect(isMacrobendSequence([bend(0.2), bend(0.2)])).toBe(false)
    expect(isMacrobendSequence([{ ...bend(0.2), radius_mm: 0 }])).toBe(false)
    expect(isMacrobendSequence([{ ...bend(0.2), direction: 'up' }])).toBe(false)
    expect(isMacrobendSequence([{ ...bend(0.2), extra: true }])).toBe(false)
    expect(
      isMacrobendSequence(
        Array.from({ length: 33 }, (_, index) => bend((index + 1) / 34)),
      ),
    ).toBe(false)
  })

  test('matches bend inputs by every current field and order', () => {
    const inputs = [bend(0.2), bend(0.7, { direction: 'right' })]

    expect(macrobendInputsMatch(inputs, structuredClone(inputs))).toBe(true)
    expect(macrobendInputsMatch(inputs, [...inputs].reverse())).toBe(false)
    expect(
      macrobendInputsMatch(inputs, [bend(0.2), bend(0.7, { radius_mm: 13 })]),
    ).toBe(false)
    expect(
      macrobendInputsMatch(inputs, [
        bend(0.2),
        { ...bend(0.7, { direction: 'right' }), angle_deg: 180 },
      ]),
    ).toBe(false)
  })

  test('accepts empty results and calculated Marcuse invariants', () => {
    expect(isMacrobendLossResult(emptyResult())).toBe(true)
    expect(isMacrobendLossResult(result())).toBe(true)
    expect(result().bends[0].bend_length_m).toBeCloseTo(
      (12 * Math.PI) / 1000 / 2,
    )
    expect(result().bends[0].local_loss_db_per_m).toBeCloseTo(
      DB_PER_NEPER_POWER * result().bends[0].alpha_power_per_m,
    )
    expect(result().total_bend_loss_db).toBeCloseTo(
      result().bends.reduce(
        (total, point) => total + point.estimated_radiation_loss_db,
        0,
      ),
    )
  })

  test('rejects malformed calculated fields, aggregates, ordering, and metadata', () => {
    const valid = result()
    const cases: unknown[] = [
      { ...valid, bends: [{ ...valid.bends[0], bend_length_m: 0 }] },
      {
        ...valid,
        bends: [{ ...valid.bends[0], local_loss_db_per_m: 0 }],
      },
      {
        ...valid,
        bends: [valid.bends[1], valid.bends[0]],
      },
      { ...valid, total_bend_loss_db: 0 },
      { ...valid, output_power_dbm: valid.input_power_dbm },
      {
        ...valid,
        model_manifest: {
          ...manifest,
          scientific_label: 'User supplied bend loss' as never,
        },
      },
      {
        ...valid,
        model_manifest: { ...manifest, model_version: '2.0.0' as never },
      },
    ]

    for (const value of cases) {
      expect(isMacrobendLossResult(value)).toBe(false)
    }
  })

  test('preserves the exact scientific label', () => {
    expect(result().model_manifest.scientific_label).toBe(
      'Estimated LP01 macrobend radiation loss — Marcuse model',
    )
  })
})
