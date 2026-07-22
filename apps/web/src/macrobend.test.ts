import { describe, expect, test } from 'vitest'

import type { components } from '../../../packages/shared_schemas/generated/api'
import {
  isMacrobendLossResult,
  isMacrobendSequence,
  macrobendInputsMatch,
} from './macrobend'

type MacrobendInput = components['schemas']['MacrobendInput']
type MacrobendLossResult = components['schemas']['MacrobendLossResult']

function bend(positionFraction: number, suppliedLossDb = 0.4): MacrobendInput {
  return {
    angle_deg: 90,
    position_fraction: positionFraction,
    radius_mm: 12,
    supplied_loss_db: suppliedLossDb,
  }
}

const manifest = {
  aggregation: 'additive_db',
  assumptions: [],
  limitations: [],
  loss_source: 'user_supplied',
  model_id: 'user_supplied_macrobend_loss',
  model_version: '1.0.0',
} satisfies components['schemas']['MacrobendLossManifest']

function result(): MacrobendLossResult {
  return {
    bends: [
      {
        ...bend(0.2),
        cumulative_bend_loss_db: 0.4,
        output_power_dbm: -5.9,
      },
      {
        ...bend(0.7, 0.6),
        cumulative_bend_loss_db: 1,
        output_power_dbm: -6.5,
      },
    ],
    input_power_dbm: -5.5,
    model_manifest: manifest,
    output_power_dbm: -6.5,
    total_bend_loss_db: 1,
  }
}

describe('macrobend contract validation', () => {
  test('accepts empty and strictly ordered input sequences', () => {
    expect(isMacrobendSequence([])).toBe(true)
    expect(isMacrobendSequence([bend(0.2), bend(0.7)])).toBe(true)
  })

  test('rejects duplicate positions, invalid fields, extras, and more than 32 bends', () => {
    expect(isMacrobendSequence([bend(0.2), bend(0.2)])).toBe(false)
    expect(isMacrobendSequence([{ ...bend(0.2), radius_mm: 0 }])).toBe(false)
    expect(isMacrobendSequence([{ ...bend(0.2), extra: true }])).toBe(false)
    expect(
      isMacrobendSequence(
        Array.from({ length: 33 }, (_, index) => bend((index + 1) / 34)),
      ),
    ).toBe(false)
  })

  test('matches bend inputs by every persisted field and order', () => {
    const inputs = [bend(0.2), bend(0.7, 0.6)]

    expect(macrobendInputsMatch(inputs, structuredClone(inputs))).toBe(true)
    expect(macrobendInputsMatch(inputs, [...inputs].reverse())).toBe(false)
    expect(macrobendInputsMatch(inputs, [bend(0.2), bend(0.7, 0.7)])).toBe(
      false,
    )
  })

  test('accepts empty and accumulated passive-loss results', () => {
    expect(
      isMacrobendLossResult({
        bends: [],
        input_power_dbm: -5.5,
        model_manifest: manifest,
        output_power_dbm: -5.5,
        total_bend_loss_db: 0,
      }),
    ).toBe(true)
    expect(isMacrobendLossResult(result())).toBe(true)
  })

  test('rejects malformed cumulative loss, power, order, and manifest metadata', () => {
    const cases: MacrobendLossResult[] = [
      { ...result(), total_bend_loss_db: 0.9 },
      { ...result(), output_power_dbm: -6.4 },
      {
        ...result(),
        bends: [result().bends[1], result().bends[0]],
      },
      {
        ...result(),
        model_manifest: { ...manifest, model_version: '2.0.0' as never },
      },
    ]

    for (const value of cases) {
      expect(isMacrobendLossResult(value)).toBe(false)
    }
  })
})
