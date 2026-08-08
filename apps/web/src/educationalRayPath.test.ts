import { describe, expect, test } from 'vitest'

import type { components } from '../../../packages/shared_schemas/generated/api'
import {
  buildCriticalRayPath,
  buildReflectedRayPath,
  buildTransmittedRayPath,
} from './educationalRayPath'
import { buildFibrePath, getFibrePathFrame } from './fibreShowcase'

type MacrobendLossResult = components['schemas']['MacrobendLossResult']
type MacrobendInput = components['schemas']['MacrobendInput']

function bend(): MacrobendInput {
  return {
    position_fraction: 0.5,
    radius_mm: 15,
    angle_deg: 90,
    direction: 'left',
  }
}

function bendResult(
  input: MacrobendInput,
  lossDb: number,
): MacrobendLossResult {
  const bendLengthM =
    input.radius_mm * 1e-3 * ((input.angle_deg * Math.PI) / 180)
  const localLossDbPerM = lossDb / bendLengthM
  const alphaPowerPerM = localLossDbPerM / (10 / Math.log(10))

  return {
    beta_per_m: 5_950_000,
    beta_source: 'scalar_step_index_lp01',
    cladding_radius_m: null,
    core_radius_m: 4.1e-6,
    input_power_dbm: -3,
    max_local_loss_db_per_m: localLossDbPerM,
    minimum_bend_radius_m: input.radius_mm * 1e-3,
    n_cladding: 1.465,
    n_core: 1.47,
    numerical_underflow: false,
    total_bend_loss_db: lossDb,
    output_power_dbm: -3 - lossDb,
    total_bent_length_m: bendLengthM,
    validity: 'valid',
    warnings: [],
    wavelength_m: 1.55e-6,
    bends: [
      {
        ...input,
        direction: input.direction ?? 'left',
        alpha_power_per_m: alphaPowerPerM,
        bend_length_m: bendLengthM,
        local_loss_db_per_m: localLossDbPerM,
        estimated_radiation_loss_db: lossDb,
        cumulative_bend_loss_db: lossDb,
        numerical_underflow: false,
        output_power_dbm: -3 - lossDb,
        validity: 'valid',
        warnings: [],
      },
    ],
    model_manifest: {
      assumptions: [],
      limitations: [],
      loss_source: 'calculated',
      model_id: 'marcuse_lp01_step_index_macrobend',
      model_version: '1.0.0',
      path_model: 'piecewise_constant_curvature',
      references: [],
      scientific_label:
        'Estimated LP01 macrobend radiation loss — Marcuse model',
    },
  }
}

describe('educational ray path', () => {
  test('keeps reflected samples inside the core and on the physical bend', () => {
    const bends = [bend()]
    const path = buildFibrePath('straight', 8, bends)
    const chunks = buildReflectedRayPath(
      path,
      0.4,
      0.3,
      bends,
      bendResult(bends[0], 0.4),
    )
    const points = chunks.flatMap((chunk) => chunk.points)

    expect(chunks).toHaveLength(2)
    expect(points.some((point) => Math.abs(point.position[2]) > 0.2)).toBe(true)
    for (const point of points) {
      const frame = getFibrePathFrame(path, point.t)
      const radialDistance = Math.hypot(
        point.position[0] - frame.position[0],
        point.position[1] - frame.position[1],
        point.position[2] - frame.position[2],
      )
      expect(radialDistance).toBeLessThanOrEqual(0.4 * 0.82 + 1e-9)
    }
  })

  test('keeps geometry independent from bend loss and uses calculated backend loss', () => {
    const lowBend = bend()
    const highBend = bend()
    const lowPath = buildFibrePath('straight', 8, [lowBend])
    const highPath = buildFibrePath('straight', 8, [highBend])
    const low = buildReflectedRayPath(
      lowPath,
      0.4,
      0.3,
      [lowBend],
      bendResult(lowBend, 0.2),
    )
    const high = buildReflectedRayPath(
      highPath,
      0.4,
      0.3,
      [highBend],
      bendResult(highBend, 1.5),
    )

    expect(
      low.flatMap((chunk) => chunk.points.map((point) => point.position)),
    ).toEqual(
      high.flatMap((chunk) => chunk.points.map((point) => point.position)),
    )
    expect(low.at(-1)).toMatchObject({
      cumulativeLossDb: 0.2,
      outputPowerDbm: -3.2,
    })
    expect(high.at(-1)).toMatchObject({
      cumulativeLossDb: 1.5,
      outputPowerDbm: -4.5,
    })
  })

  test('places the critical ray at the local core boundary', () => {
    const path = buildFibrePath('s_bend', 8)
    const points = buildCriticalRayPath(path, 0.4)

    for (const point of points) {
      const frame = getFibrePathFrame(path, point.t)
      expect(point.position[1] - frame.position[1]).toBeCloseTo(0.4 * 0.98)
      expect(point.position[2] - frame.position[2]).toBeCloseTo(0)
    }
  })

  test('starts transmission in the core and moves leakage into the cladding', () => {
    const path = buildFibrePath('gentle_arc', 8)
    const ray = buildTransmittedRayPath(path, 0.4, 0.85, 7)

    for (const point of ray.incident) {
      const frame = getFibrePathFrame(path, point.t)
      expect(Math.abs(point.position[1] - frame.position[1])).toBeLessThan(0.4)
    }
    const final = ray.exiting.at(-1)
    expect(final).toBeDefined()
    const finalFrame = getFibrePathFrame(path, final?.t ?? 1)
    expect(
      Math.abs((final?.position[1] ?? 0) - finalFrame.position[1]),
    ).toBeCloseTo(0.85 * 0.72)
    expect(ray.leakageMarkers).toHaveLength(7)
    expect(
      ray.leakageMarkers.every((point) =>
        point.position.every(Number.isFinite),
      ),
    ).toBe(true)
  })
})
