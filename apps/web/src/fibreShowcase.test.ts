import { describe, expect, test } from 'vitest'

import {
  buildFibreCurve,
  getCurveMidpoint,
  getScaleMarkers,
  getSpatialPowerMarkers,
  getSpatialPulseMarkers,
  sampleFibrePath,
} from './fibreShowcase'
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
