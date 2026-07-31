import { describe, expect, test } from 'vitest'

import {
  initialPandaFieldValues,
  parsePandaGeometryValues,
  type PandaFieldFormValues,
} from './pandaFieldModel'
import {
  isPandaMeshResult,
  pandaMeshRequestsMatch,
  parsePandaMeshGeometry,
  type PandaMeshRequest,
  type PandaMeshResult,
} from './pandaMeshModel'

function values(
  overrides: Partial<PandaFieldFormValues> = {},
): PandaFieldFormValues {
  return { ...initialPandaFieldValues, ...overrides }
}

function request(refinementLevel: 0 | 1 | 2 = 0): PandaMeshRequest {
  const parsed = parsePandaMeshGeometry(values())
  if (parsed.request === null) {
    throw new Error('Expected valid geometry')
  }
  return { ...parsed.request, refinement_level: refinementLevel }
}

function result(configuration = request()): PandaMeshResult {
  const nodes = Array.from({ length: 4 }, (_, index) => [
    index === 1 || index === 3 ? 1 : 0,
    index === 2 || index === 3 ? 1 : 0,
  ]) as [number, number][]
  const elements = [
    [0, 1, 2],
    [0, 2, 3],
    [1, 3, 2],
    [0, 3, 1],
  ] as [number, number, number][]
  return {
    configuration,
    nodes_m: nodes,
    elements,
    region_tags: ['cladding', 'core', 'sap_1', 'sap_2'],
    node_count: nodes.length,
    element_count: elements.length,
    region_summaries: (['cladding', 'core', 'sap_1', 'sap_2'] as const).map(
      (region) => ({
        region,
        element_count: 1,
        target_area_m2: 1,
        total_area_m2: 1,
      }),
    ),
    quality: {
      minimum_angle_deg: 30,
      minimum_normalized_quality: 0.5,
      mean_normalized_quality: 0.8,
    },
    warnings: [
      {
        code: 'polygonal_interface_approximation',
        message: 'Interfaces are polygonal.',
      },
    ],
    model_manifest: {
      model_id: 'panda_constrained_delaunay_mesh',
      model_version: '1.0.0',
      geometry_model: 'PandaGeometry',
      interface_model: 'piecewise_linear_circular_interfaces',
      method: 'constrained_delaunay',
      element_family: 'first_order_triangles',
      generator_version: 'triangle 20250106',
      fem_compatibility_version: 'scikit-fem 12.0.2',
      quality_target_minimum_angle_deg: 20,
      mesh_only: true,
      solved_fem_fields: false,
      coordinate_units: 'm',
      assumptions: ['polygonal interfaces'],
      limitations: ['mesh only'],
    },
  }
}

describe('PANDA mesh model', () => {
  test('shares geometry validation and ignores thermal and sampling validity', () => {
    const parsed = parsePandaGeometryValues(
      values({
        temperatureC: 'not used',
        gridPoints: 'not used',
      }),
    )
    expect(parsed.geometry).not.toBeNull()
    expect(parsed.fieldErrors).toEqual({})
  })

  test('rejects invalid shared geometry and exposes its field errors', () => {
    const parsed = parsePandaMeshGeometry(
      values({ sap1CenterXUm: '0', sap2CenterXUm: '0' }),
    )
    expect(parsed.request).toBeNull()
    expect(parsed.fieldErrors.sap1CenterXUm).toMatch(/overlap/)
    expect(parsed.fieldErrors.sap2CenterXUm).toMatch(/overlap/)
  })

  test('validates the complete mesh-only response contract', () => {
    const mesh = result()
    expect(isPandaMeshResult(mesh)).toBe(true)

    const badNodes = structuredClone(mesh)
    badNodes.nodes_m[0] = [Number.NaN, 0]
    expect(isPandaMeshResult(badNodes)).toBe(false)

    const badConnectivity = structuredClone(mesh)
    badConnectivity.elements[0] = [0, 0, 1]
    expect(isPandaMeshResult(badConnectivity)).toBe(false)

    const badRegions = structuredClone(mesh)
    badRegions.region_tags[0] = 'unknown' as never
    expect(isPandaMeshResult(badRegions)).toBe(false)

    const badSummaries = structuredClone(mesh)
    badSummaries.region_summaries[0].element_count = 2
    expect(isPandaMeshResult(badSummaries)).toBe(false)

    const badQuality = structuredClone(mesh)
    badQuality.quality.mean_normalized_quality = 2
    expect(isPandaMeshResult(badQuality)).toBe(false)

    const badWarnings = structuredClone(mesh)
    badWarnings.warnings[0].code = 'unknown' as never
    expect(isPandaMeshResult(badWarnings)).toBe(false)

    const badManifest = structuredClone(mesh)
    badManifest.model_manifest.solved_fem_fields = true as never
    expect(isPandaMeshResult(badManifest)).toBe(false)
  })

  test('requires the requested geometry and refinement to match the response', () => {
    expect(
      pandaMeshRequestsMatch(request(1), result(request(1)).configuration),
    ).toBe(true)
    expect(
      pandaMeshRequestsMatch(request(0), result(request(1)).configuration),
    ).toBe(false)
  })
})
