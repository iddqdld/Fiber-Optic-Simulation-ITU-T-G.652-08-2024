import { describe, expect, test } from 'vitest'

import {
  buildFibreCurve,
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

  test('maps backend power samples onto the displayed path', () => {
    const markers = getSpatialPowerMarkers('straight', 8, attenuation, 3)

    expect(markers).toHaveLength(3)
    expect(markers[0].powerDbm).toBe(-3)
    expect(markers[2].powerDbm).toBe(-5)
    expect(markers[0].radius).toBeGreaterThan(markers[2].radius)
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
})
