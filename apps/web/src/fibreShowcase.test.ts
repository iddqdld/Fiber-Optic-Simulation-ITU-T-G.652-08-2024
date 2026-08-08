import { describe, expect, test } from 'vitest'
import { Quaternion, Vector3 } from 'three'

import type { components } from '../../../packages/shared_schemas/generated/api'
import {
  buildFibreCurve,
  buildFibrePath,
  getFibrePathFrame,
  getLongitudinalSegmentTransform,
  getTangentQuaternion,
  getCurveMidpoint,
  getScaleMarkers,
  getSpatialPowerMarkers,
  getSpatialPulseMarkers,
  getSpatialBendMarkers,
  sampleFibrePath,
  sampleFibrePathFrames,
} from './fibreShowcase'
type MacrobendLossResult = components['schemas']['MacrobendLossResult']
type MacrobendInput = components['schemas']['MacrobendInput']
import type { PowerDistanceData } from './powerDistancePlot'
import type { PulseAnimationData } from './pulseAnimation'

const attenuation: PowerDistanceData = {
  lengthKm: 10,
  attenuationDbPerKm: 0.2,
  inputPowerDbm: -3,
  sectionLossDb: 2,
  outputPowerDbm: -5,
  distanceSamplesKm: [0, 5, 10],
  powerSamplesDbm: [-3, -4, -5],
  modelId: 'constant_fibre_attenuation',
  modelVersion: '1.0.0',
}

const pulse: PulseAnimationData = {
  inputPulseFwhmPs: 25,
  outputPulseFwhmPs: 40,
  dispersionBroadeningFwhmPs: 31.22,
  sectionLengthKm: 10,
  groupDelayPs: 48950,
  modelId: 'first_order_chromatic_pulse_broadening',
  modelVersion: '1.0.0',
  widthConvention: 'fwhm',
  delayModelId: 'constant_group_index_delay',
  delayModelVersion: '1.0.0',
}

function makeAttenuation(
  overrides: Partial<PowerDistanceData> = {},
): PowerDistanceData {
  return {
    ...attenuation,
    ...overrides,
  }
}

function bend(
  direction: 'left' | 'right' = 'left',
  overrides: Partial<MacrobendInput> = {},
): MacrobendInput {
  return {
    position_fraction: 0.5,
    radius_mm: 15,
    angle_deg: 90,
    direction,
    ...overrides,
  }
}

function bendLossFor(inputs: readonly MacrobendInput[]): MacrobendLossResult {
  let cumulativeLossDb = 0
  const bends = inputs.map((input) => {
    const bendLengthM =
      input.radius_mm * 1e-3 * ((input.angle_deg * Math.PI) / 180)
    const localLossDbPerM = 0.25
    const estimatedRadiationLossDb = localLossDbPerM * bendLengthM
    cumulativeLossDb += estimatedRadiationLossDb
    return {
      alpha_power_per_m: localLossDbPerM / (10 / Math.log(10)),
      angle_deg: input.angle_deg,
      bend_length_m: bendLengthM,
      cumulative_bend_loss_db: cumulativeLossDb,
      direction: input.direction,
      estimated_radiation_loss_db: estimatedRadiationLossDb,
      local_loss_db_per_m: localLossDbPerM,
      numerical_underflow: false,
      output_power_dbm: -3 - cumulativeLossDb,
      position_fraction: input.position_fraction,
      radius_mm: input.radius_mm,
      validity: 'valid' as const,
      warnings: [],
    }
  })
  return {
    beta_per_m: 5_950_000,
    beta_source: 'scalar_step_index_lp01',
    bends,
    cladding_radius_m: null,
    core_radius_m: 4.1e-6,
    input_power_dbm: -3,
    max_local_loss_db_per_m: inputs.length === 0 ? 0 : 0.25,
    minimum_bend_radius_m:
      inputs.length === 0
        ? null
        : Math.min(...inputs.map((input) => input.radius_mm * 1e-3)),
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
    n_cladding: 1.465,
    n_core: 1.47,
    numerical_underflow: false,
    output_power_dbm: -3 - cumulativeLossDb,
    total_bend_loss_db: cumulativeLossDb,
    total_bent_length_m: bends.reduce(
      (total, point) => total + point.bend_length_m,
      0,
    ),
    validity: 'valid',
    warnings: [],
    wavelength_m: 1.55e-6,
  }
}

describe('fibreShowcase helpers', () => {
  test('builds curved paths with entrance and exit on the fibre axis', () => {
    const straight = sampleFibrePath('straight', 8, 5)
    const arc = sampleFibrePath('gentle_arc', 8, 5)
    const bend = buildFibreCurve('s_bend', 8)

    expect(straight[0].position[0]).toBeCloseTo(-4)
    expect(straight[straight.length - 1].position[0]).toBeCloseTo(4)
    expect(arc[2].position[2]).toBeGreaterThan(0)
    expect(bend.getPoint(0).x).toBeCloseTo(-4)
    expect(bend.getPoint(1).x).toBeCloseTo(4)
  })

  test('samples curved paths by normalized arc length', () => {
    const curve = buildFibreCurve('gentle_arc', 8)
    const samples = sampleFibrePath('gentle_arc', 8, 5)
    const midpoint = getCurveMidpoint('gentle_arc', 8)

    expect(samples.map((sample) => sample.t)).toEqual([0, 0.25, 0.5, 0.75, 1])
    for (const sample of samples) {
      const expected = curve.getPointAt(sample.t)
      expect(sample.position[0]).toBeCloseTo(expected.x)
      expect(sample.position[1]).toBeCloseTo(expected.y)
      expect(sample.position[2]).toBeCloseTo(expected.z)
    }

    const expectedMidpoint = curve.getPointAt(0.5)
    expect(midpoint[0]).toBeCloseTo(expectedMidpoint.x)
    expect(midpoint[1]).toBeCloseTo(expectedMidpoint.y)
    expect(midpoint[2]).toBeCloseTo(expectedMidpoint.z)
  })

  test('uses configured bends instead of route presets', () => {
    const bends = [bend()]
    const straightPath = buildFibrePath('straight', 8, bends)
    const presetPath = buildFibrePath('s_bend', 8, bends)

    expect(straightPath.source).toBe('physical_bends')
    expect(presetPath.source).toBe('physical_bends')
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(straightPath.curve.getPointAt(t).toArray()).toEqual(
        presetPath.curve.getPointAt(t).toArray(),
      )
    }
  })

  test('mirrors left and right planar bends across the path axis', () => {
    const left = buildFibrePath('straight', 8, [bend('left')])
    const right = buildFibrePath('straight', 8, [bend('right')])

    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const leftPoint = left.curve.getPointAt(t)
      const rightPoint = right.curve.getPointAt(t)
      expect(leftPoint.x).toBeCloseTo(rightPoint.x)
      expect(leftPoint.y).toBe(0)
      expect(rightPoint.y).toBe(0)
      expect(leftPoint.z).toBeCloseTo(-rightPoint.z)
    }
  })

  test('changes the path predictably with radius and angle', () => {
    const small = buildFibrePath('straight', 8, [
      bend('left', { radius_mm: 2, angle_deg: 45 }),
    ])
    const large = buildFibrePath('straight', 8, [
      bend('left', { radius_mm: 30, angle_deg: 90 }),
    ])

    expect(small.bends[0].displayRadius).toBeLessThan(
      large.bends[0].displayRadius,
    )
    expect(getFibrePathFrame(small, 1).tangent[2]).toBeCloseTo(Math.SQRT1_2)
    const largeExitTangent = getFibrePathFrame(large, 1).tangent
    expect(largeExitTangent[0]).toBeCloseTo(0)
    expect(largeExitTangent[1]).toBe(0)
    expect(largeExitTangent[2]).toBeCloseTo(1)
  })

  test('keeps path stations and endpoint bends finite', () => {
    const bends = [
      bend('left', { position_fraction: 0, angle_deg: 180 }),
      bend('right', { position_fraction: 1, radius_mm: 30, angle_deg: 360 }),
    ]
    const path = buildFibrePath('straight', 8, bends)
    const markers = getSpatialBendMarkers(
      'straight',
      8,
      bends,
      path,
      bendLossFor(bends),
    )

    expect(markers.map((marker) => marker.positionFraction)).toEqual([0, 1])
    expect(
      markers.every((marker) =>
        marker.quaternion.every((value) => Number.isFinite(value)),
      ),
    ).toBe(true)
    expect(
      sampleFibrePath('straight', 8, 33, path).every((sample) =>
        sample.position.every(Number.isFinite),
      ),
    ).toBe(true)
  })

  test('returns continuous orthonormal planar path frames', () => {
    const path = buildFibrePath('straight', 8, [
      bend('left', { position_fraction: 0.3, angle_deg: 75 }),
      bend('right', { position_fraction: 0.7, angle_deg: 110 }),
    ])
    const frames = sampleFibrePathFrames(path, 129)

    expect(frames).toHaveLength(129)
    for (const frame of frames) {
      const tangentLength = Math.hypot(...frame.tangent)
      const normalLength = Math.hypot(...frame.normal)
      const binormalLength = Math.hypot(...frame.binormal)
      const tangentNormal = frame.tangent.reduce(
        (sum, value, index) => sum + value * frame.normal[index],
        0,
      )
      expect(tangentLength).toBeCloseTo(1)
      expect(normalLength).toBeCloseTo(1)
      expect(binormalLength).toBeCloseTo(1)
      expect(tangentNormal).toBeCloseTo(0)
      expect(frame.position.every(Number.isFinite)).toBe(true)
    }

    const midpoint = getFibrePathFrame(path, 0.5)
    expect(midpoint.normal).toEqual([0, 1, 0])
  })

  test('rotates the local longitudinal axis onto each path tangent', () => {
    const path = buildFibrePath('straight', 8, [
      bend('left', { position_fraction: 0.5, angle_deg: 180 }),
    ])

    for (const t of [0, 0.5, 1]) {
      const frame = getFibrePathFrame(path, t)
      const quaternion = new Quaternion(...getTangentQuaternion(frame.tangent))
      const longitudinal = new Vector3(1, 0, 0).applyQuaternion(quaternion)

      expect(longitudinal.x).toBeCloseTo(frame.tangent[0])
      expect(longitudinal.y).toBeCloseTo(frame.tangent[1])
      expect(longitudinal.z).toBeCloseTo(frame.tangent[2])
      expect(quaternion.toArray().every(Number.isFinite)).toBe(true)
    }
  })

  test('aligns a longitudinal segment in all three dimensions', () => {
    const transform = getLongitudinalSegmentTransform([0, 0, 0], [1, 2, 3])
    const quaternion = new Quaternion(...transform.quaternion)
    const direction = new Vector3(1, 0, 0).applyQuaternion(quaternion)

    expect(transform.length).toBeCloseTo(Math.sqrt(14))
    expect(transform.position).toEqual([0.5, 1, 1.5])
    expect(direction.x).toBeCloseTo(1 / Math.sqrt(14))
    expect(direction.y).toBeCloseTo(2 / Math.sqrt(14))
    expect(direction.z).toBeCloseTo(3 / Math.sqrt(14))
  })

  test('reports invalid physical bend data without using a preset', () => {
    const invalid = bend('left', { radius_mm: 0 })
    const path = buildFibrePath('s_bend', 8, [invalid])

    expect(path.source).toBe('invalid_bends')
    expect(path.error).toContain('invalid physical path data')
  })

  test('maps backend power samples onto the displayed path', () => {
    const markers = getSpatialPowerMarkers('straight', 8, attenuation, 3)

    expect(markers).toHaveLength(3)
    expect(markers[0].powerDbm).toBe(-3)
    expect(markers[2].powerDbm).toBe(-5)
    expect(markers[0].radius).toBeGreaterThan(markers[2].radius)
  })

  test('places representative power markers using non-uniform backend distances', () => {
    const data = makeAttenuation({
      lengthKm: 10,
      distanceSamplesKm: [0, 1, 6, 10],
      powerSamplesDbm: [-3, -3.2, -4.2, -5],
    })
    const markers = getSpatialPowerMarkers('straight', 8, data, 3)

    expect(markers.map((marker) => marker.t)).toEqual([0, 0.6, 1])
    expect(markers.map((marker) => marker.distanceKm)).toEqual([0, 6, 10])
    expect(markers.map((marker) => marker.powerDbm)).toEqual([-3, -4.2, -5])
  })

  test('handles constant power without invalid visual values', () => {
    const data = makeAttenuation({
      distanceSamplesKm: [0, 5, 10],
      powerSamplesDbm: [-3, -3, -3],
    })
    const markers = getSpatialPowerMarkers('s_bend', 8, data, 3)

    expect(markers).toHaveLength(3)
    expect(markers.every((marker) => marker.normalizedPower === 0.5)).toBe(true)
    expect(markers.every((marker) => Number.isFinite(marker.radius))).toBe(true)
  })

  test.each([
    null,
    undefined,
    makeAttenuation({ distanceSamplesKm: [0, 5], powerSamplesDbm: [-3] }),
    makeAttenuation({
      distanceSamplesKm: [0, Number.NaN, 10],
      powerSamplesDbm: [-3, -4, -5],
    }),
    makeAttenuation({
      distanceSamplesKm: [0, 7, 6],
      powerSamplesDbm: [-3, -4, -5],
    }),
    makeAttenuation({
      distanceSamplesKm: [0, 5, 9],
      powerSamplesDbm: [-3, -4, -5],
    }),
  ])('rejects invalid power data safely', (data) => {
    expect(getSpatialPowerMarkers('straight', 8, data, 3)).toEqual([])
  })

  test('handles zero-length power data and marker limits safely', () => {
    const data = makeAttenuation({
      lengthKm: 0,
      distanceSamplesKm: [0],
      powerSamplesDbm: [-3],
    })

    expect(getSpatialPowerMarkers('straight', 8, data, 0)).toEqual([])
    expect(getSpatialPowerMarkers('straight', 8, data, 1)).toMatchObject([
      { t: 0, distanceKm: 0, powerDbm: -3 },
    ])
    expect(getSpatialPowerMarkers('straight', 8, data, Number.NaN)).toEqual([])
    expect(
      getSpatialPowerMarkers('straight', 8, data, Number.POSITIVE_INFINITY),
    ).toEqual([])
  })

  test('places input and output pulse markers at path ends', () => {
    const markers = getSpatialPulseMarkers('gentle_arc', 8, pulse)

    expect(markers).toHaveLength(2)
    expect(markers[0].id).toBe('input')
    expect(markers[1].id).toBe('output')
    expect(markers[1].radius).toBeGreaterThan(markers[0].radius)
  })

  test('labels scale markers with physical length when available', () => {
    const markers = getScaleMarkers('straight', 8, 12.5, 3)

    expect(markers[0].label).toContain('0.00 km')
    expect(markers[2].label).toContain('12.50 km')
  })

  test('labels scale markers with percentage when physical length is unavailable', () => {
    const markers = getScaleMarkers('gentle_arc', 8, null, 3)

    expect(markers.map((marker) => marker.label)).toEqual([
      '0 (0%)',
      '50%',
      'L (100%)',
    ])
  })

  test('returns no path-derived markers for invalid inputs', () => {
    expect(sampleFibrePath('straight', Number.NaN, 3)).toEqual([])
    expect(sampleFibrePath('straight', 8, Number.POSITIVE_INFINITY)).toEqual([])
    expect(getCurveMidpoint('gentle_arc', Number.NaN)).toEqual([0, 0, 0])
    expect(getSpatialPulseMarkers('straight', Number.NaN, pulse)).toEqual([])
    expect(getScaleMarkers('straight', 8, 10, 0)).toEqual([])
  })
})
