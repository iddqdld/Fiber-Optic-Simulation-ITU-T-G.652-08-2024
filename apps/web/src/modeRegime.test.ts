import { describe, expect, test } from 'vitest'

import {
  formatModeRegimeLabel,
  isValidModeRegimeSummary,
  listSupportedModes,
  MODE_REGIME_CUTOFF_V,
  schematicModeIntensity,
  type ModeRegimeSummary,
} from './modeRegime'

const validSummary: ModeRegimeSummary = {
  modeRegime: 'single_mode',
  vNumber: 2.0,
  cutoffV: MODE_REGIME_CUTOFF_V,
  approximateModeCount: null,
  numericalAperture: 0.12,
  criticalAngleDeg: 82,
  modelId: 'ideal_circular_step_index_guidance',
  modelVersion: '1.0.0',
}

describe('modeRegime', () => {
  test('accepts a finite guidance summary', () => {
    expect(isValidModeRegimeSummary(validSummary)).toBe(true)
  })

  test('rejects non-finite V', () => {
    expect(
      isValidModeRegimeSummary({ ...validSummary, vNumber: Number.NaN }),
    ).toBe(false)
  })

  test('lists only LP01 below the LP11 cutoff', () => {
    const modes = listSupportedModes(2.0)
    expect(modes.find((mode) => mode.id === 'LP01')?.supported).toBe(true)
    expect(modes.find((mode) => mode.id === 'LP11')?.supported).toBe(false)
  })

  test('marks LP11 supported at and above 2.405', () => {
    expect(
      listSupportedModes(MODE_REGIME_CUTOFF_V).find((mode) => mode.id === 'LP11')
        ?.supported,
    ).toBe(true)
    expect(
      listSupportedModes(3.0).find((mode) => mode.id === 'LP11')?.supported,
    ).toBe(true)
  })

  test('formats regime labels', () => {
    expect(formatModeRegimeLabel('single_mode')).toBe('Single-mode')
    expect(formatModeRegimeLabel('multimode')).toBe('Multimode')
  })

  test('LP01 schematic peaks on axis and LP11 vanishes on axis', () => {
    expect(schematicModeIntensity('LP01', 0, 0, 1)).toBeGreaterThan(0.9)
    expect(schematicModeIntensity('LP11', 0, 0, 1)).toBe(0)
    expect(schematicModeIntensity('LP11', 0.7, 0, 1)).toBeGreaterThan(0)
  })
})
