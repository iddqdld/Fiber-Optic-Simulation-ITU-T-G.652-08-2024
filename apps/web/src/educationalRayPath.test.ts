import { describe, expect, test } from 'vitest'

import type { MacrobendInput } from './Level1Form'
import {
  buildCriticalRayPath,
  buildReflectedRayPath,
  buildTransmittedRayPath,
} from './educationalRayPath'
import { buildFibrePath, getFibrePathFrame } from './fibreShowcase'
import type { MacrobendLossResult } from './macrobend'

function bend(lossDb = 0.4): MacrobendInput {
  return {
    position_fraction: 0.5,
    radius_mm: 15,
    angle_deg: 90,
    direction: 'left',
    supplied_loss_db: lossDb,
  }
}

function bendResult(input: MacrobendInput): MacrobendLossResult {
  return {
    input_power_dbm: -3,
    total_bend_loss_db: input.supplied_loss_db,
    output_power_dbm: -3 - input.supplied_loss_db,
    bends: [
      {
        ...input,
        direction: input.direction ?? 'left',
        cumulative_bend_loss_db: input.supplied_loss_db,
        output_power_dbm: -3 - input.supplied_loss_db,
      },
    ],
    model_manifest: {
      model_id: 'user_supplied_macrobend_loss',
      model_version: '1.1.0',
      loss_source: 'user_supplied',
      aggregation: 'additive_db',
      assumptions: [],
      limitations: [],
    },
  }
}

describe('educational ray path', () => {
  test('keeps reflected samples inside the core and on the physical bend', () => {
    const bends = [bend()]
    const path = buildFibrePath('straight', 8, bends)
    const chunks = buildReflectedRayPath(path, 0.4, 0.3, bends, null)
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

  test('keeps geometry independent from supplied loss and uses backend loss', () => {
    const lowBend = bend(0.2)
    const highBend = bend(1.5)
    const lowPath = buildFibrePath('straight', 8, [lowBend])
    const highPath = buildFibrePath('straight', 8, [highBend])
    const low = buildReflectedRayPath(
      lowPath,
      0.4,
      0.3,
      [lowBend],
      bendResult(lowBend),
    )
    const high = buildReflectedRayPath(
      highPath,
      0.4,
      0.3,
      [highBend],
      bendResult(highBend),
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
