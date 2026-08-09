import { describe, expect, test } from 'vitest'

import { buildFibrePath, getFibrePathFrame } from './fibreShowcase'
import type { ModeProfileData } from './FibreGeometryView'
import {
  getLP01PathFieldGeometry,
  getScalarLPPathFieldGeometry,
  LP01_MAX_VERTEX_COUNT,
  LP01_PATH_SAMPLE_COUNT,
} from './lp01FieldPath'
import type { ScalarModeFieldData } from './scalarMode'

function buildProfile(gridPoints = 65): ModeProfileData {
  const half = (gridPoints - 1) / 2
  const axis = Array.from(
    { length: gridPoints },
    (_, index) => ((index - half) * 15) / half,
  )
  const modeFieldRadiusUm = 4.82
  const normalizedField = axis.map((yUm) =>
    axis.map((xUm) =>
      Math.exp(-((xUm ** 2 + yUm ** 2) / modeFieldRadiusUm ** 2)),
    ),
  )

  return {
    modeFieldRadiusUm,
    gridHalfWidthUm: 15,
    gridPoints,
    xUm: axis,
    yUm: axis,
    normalizedField,
    normalizedIntensity: normalizedField.map((row) =>
      row.map((field) => field ** 2),
    ),
    modelId: 'gaussian_lp01_mode_profile',
    modelVersion: '1.0.0',
    normalizationConvention: 'unit_peak_field_and_intensity',
    radiusConvention: '1/e_field_radius',
  }
}

function vertex(
  positions: Float32Array,
  index: number,
): [number, number, number] {
  const offset = index * 3
  return [positions[offset], positions[offset + 1], positions[offset + 2]]
}

function buildSignedScalarProfile(): ScalarModeFieldData {
  const normalizedField = [
    [-0.5, 0, 0.5],
    [-1, 0, 1],
    [-0.5, 0, 0.5],
  ]
  return {
    coreRadiusUm: 4.1,
    gridHalfWidthUm: 4.1,
    gridPoints: 3,
    xUm: [-4.1, 0, 4.1],
    yUm: [-4.1, 0, 4.1],
    normalizedField,
    normalizedIntensity: normalizedField.map((row) =>
      row.map((field) => field ** 2),
    ),
    selectedMode: {
      label: 'LP11',
      azimuthal_order: 1,
      radial_order: 1,
      spatial_degeneracy: 2,
      cutoff_v_dimensionless: 2.4048255577,
      v_number_dimensionless: 3,
      u_dimensionless: 2.5,
      w_dimensionless: Math.sqrt(2.75),
      normalized_propagation_constant: 2.75 / 9,
      effective_index_dimensionless: 1.447,
      beta_per_m: 5_865_000,
    },
    modelId: 'scalar_lp_step_index_modes',
    modelVersion: '1.0.0',
    fieldLabel: 'Scalar LP mode field — weak-guidance step-index model',
    normalizationConvention: 'unit_peak_absolute_field',
    angularBasis: 'cosine_representative',
    excitationStatus: 'not_calculated',
  }
}

describe('LP01 path field geometry', () => {
  test('keeps finite normalized amplitude and intensity on the shared path', () => {
    const profile = buildProfile()
    const path = buildFibrePath('s_bend', 8)
    const geometry = getLP01PathFieldGeometry(profile, path, 4.1, 0.41)

    expect(geometry).not.toBeNull()
    expect(geometry?.pathSampleCount).toBe(LP01_PATH_SAMPLE_COUNT)
    expect(geometry?.vertexCount).toBe(LP01_MAX_VERTEX_COUNT)
    expect(Array.from(geometry?.positions ?? []).every(Number.isFinite)).toBe(
      true,
    )
    expect(
      Array.from(geometry?.normalizedField ?? []).every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    ).toBe(true)
    expect(
      Array.from(geometry?.normalizedIntensity ?? []).every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    ).toBe(true)
    expect(Math.max(...(geometry?.normalizedField ?? []))).toBe(1)
    expect(Math.max(...(geometry?.normalizedIntensity ?? []))).toBe(1)
  })

  test('places both ribbon centers on each path station', () => {
    const profile = buildProfile(5)
    const path = buildFibrePath('gentle_arc', 8)
    const geometry = getLP01PathFieldGeometry(profile, path, 4.1, 0.41, 9)

    expect(geometry).not.toBeNull()
    const profileCenter = 2
    const ribbonVertices = 9 * 5

    for (const pathIndex of [0, 4, 8]) {
      const frame = getFibrePathFrame(path, pathIndex / 8)
      const normalCenter = vertex(
        geometry!.positions,
        pathIndex * 5 + profileCenter,
      )
      const binormalCenter = vertex(
        geometry!.positions,
        ribbonVertices + pathIndex * 5 + profileCenter,
      )

      expect(normalCenter[0]).toBeCloseTo(frame.position[0])
      expect(normalCenter[1]).toBeCloseTo(frame.position[1])
      expect(normalCenter[2]).toBeCloseTo(frame.position[2])
      expect(binormalCenter[0]).toBeCloseTo(frame.position[0])
      expect(binormalCenter[1]).toBeCloseTo(frame.position[1])
      expect(binormalCenter[2]).toBeCloseTo(frame.position[2])
    }
  })

  test('uses new geometry when the route changes', () => {
    const profile = buildProfile(5)
    const straightPath = buildFibrePath('straight', 8)
    const bentPath = buildFibrePath('s_bend', 8)
    const straight = getLP01PathFieldGeometry(
      profile,
      straightPath,
      4.1,
      0.41,
      9,
    )
    const bent = getLP01PathFieldGeometry(profile, bentPath, 4.1, 0.41, 9)
    const centerVertex = 4 * 5 + 2

    expect(straight).not.toBe(bent)
    expect(vertex(straight!.positions, centerVertex)).not.toEqual(
      vertex(bent!.positions, centerVertex),
    )
  })

  test('reuses one bounded geometry for unchanged inputs', () => {
    const profile = buildProfile()
    const path = buildFibrePath('straight', 8)
    const first = getLP01PathFieldGeometry(profile, path, 4.1, 0.41)
    const second = getLP01PathFieldGeometry(profile, path, 4.1, 0.41)

    expect(second).toBe(first)
    expect(first?.vertexCount).toBeLessThanOrEqual(LP01_MAX_VERTEX_COUNT)
    expect(first?.estimatedBytes).toBeLessThan(1_000_000)
  })

  test('rejects malformed and non-finite profile samples', () => {
    const profile = buildProfile(5)
    profile.normalizedField[0][0] = Number.NaN
    const path = buildFibrePath('straight', 8)

    expect(getLP01PathFieldGeometry(profile, path, 4.1, 0.41)).toBeNull()
  })

  test('keeps one bounded signed scalar field geometry on the shared path', () => {
    const profile = buildSignedScalarProfile()
    const path = buildFibrePath('s_bend', 8)
    const geometry = getScalarLPPathFieldGeometry(profile, path, 4.1, 0.41)

    expect(geometry).not.toBeNull()
    expect(Math.min(...geometry!.normalizedField)).toBe(-1)
    expect(Math.max(...geometry!.normalizedField)).toBe(1)
    expect(geometry!.vertexCount).toBeLessThanOrEqual(LP01_MAX_VERTEX_COUNT)
    expect(geometry!.estimatedBytes).toBeLessThan(1_000_000)
    expect(getScalarLPPathFieldGeometry(profile, path, 4.1, 0.41)).toBe(
      geometry,
    )
  })
})
