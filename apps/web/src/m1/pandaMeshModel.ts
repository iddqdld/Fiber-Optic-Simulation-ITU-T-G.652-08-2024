import type { operations } from '../../../../packages/shared_schemas/generated/api'

import {
  parsePandaGeometryValues,
  type PandaFieldFormValues,
  type PandaGeometryFieldErrors,
  type PandaGeometryInputName,
} from './pandaFieldModel'

export type PandaMeshRequest =
  operations['generate_panda_mesh']['requestBody']['content']['application/json']
export type PandaMeshResult =
  operations['generate_panda_mesh']['responses'][200]['content']['application/json']

export type PandaMeshRefinementLevel = 0 | 1 | 2
export type PandaMeshPhase =
  'idle' | 'loading' | 'ready' | 'validation' | 'error'
export type PandaMeshFieldErrors = Partial<
  Record<PandaGeometryInputName, string>
>

export type PandaMeshController = {
  refinementLevel: PandaMeshRefinementLevel
  result: PandaMeshResult | null
  phase: PandaMeshPhase
  statusLabel: string
  errorMessage: string | null
  fieldErrors: PandaMeshFieldErrors
  onRefinementLevelChange: (level: PandaMeshRefinementLevel) => void
  onRetry: () => void
}

export const PANDA_MESH_MODEL_ID = 'panda_constrained_delaunay_mesh'
export const PANDA_MESH_MODEL_VERSION = '1.0.0'
export const PANDA_MESH_GENERATOR_VERSION = 'triangle 20250106'
export const PANDA_MESH_FEM_VERSION = 'scikit-fem 12.0.2'
export const PANDA_MESH_REFINEMENT_LEVELS: readonly {
  value: PandaMeshRefinementLevel
  label: string
}[] = [
  { value: 0, label: '0 Preview' },
  { value: 1, label: '1 Standard' },
  { value: 2, label: '2 Fine' },
]

const meshRegions = new Set(['cladding', 'core', 'sap_1', 'sap_2'])
const warningCodes = new Set([
  'quality_below_target',
  'polygonal_interface_approximation',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isGeometry(value: unknown): value is PandaMeshRequest['geometry'] {
  if (!isRecord(value)) {
    return false
  }
  const sapIsValid = (sap: unknown) =>
    isRecord(sap) &&
    isFiniteNumber(sap.radius_m) &&
    sap.radius_m > 0 &&
    isFiniteNumber(sap.center_x_m) &&
    isFiniteNumber(sap.center_y_m)

  return (
    isFiniteNumber(value.core_radius_m) &&
    value.core_radius_m > 0 &&
    isFiniteNumber(value.cladding_radius_m) &&
    value.cladding_radius_m > 0 &&
    isFiniteNumber(value.core_center_x_m) &&
    isFiniteNumber(value.core_center_y_m) &&
    sapIsValid(value.sap_1) &&
    sapIsValid(value.sap_2)
  )
}

function isMeshRequest(value: unknown): value is PandaMeshRequest {
  return (
    isRecord(value) &&
    isGeometry(value.geometry) &&
    isNonNegativeInteger(value.refinement_level) &&
    value.refinement_level <= 2
  )
}

function isNode(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  )
}

function isElement(
  value: unknown,
  nodeCount: number,
): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((index) => isNonNegativeInteger(index) && index < nodeCount) &&
    new Set(value).size === 3
  )
}

function hasNonZeroArea(
  element: [number, number, number],
  nodes: [number, number][],
) {
  const first = nodes[element[0]]
  const second = nodes[element[1]]
  const third = nodes[element[2]]
  const twiceArea =
    (second[0] - first[0]) * (third[1] - first[1]) -
    (second[1] - first[1]) * (third[0] - first[0])
  return Number.isFinite(twiceArea) && twiceArea !== 0
}

function isRegionSummary(value: unknown): value is {
  region: 'cladding' | 'core' | 'sap_1' | 'sap_2'
  element_count: number
  target_area_m2: number
  total_area_m2: number
} {
  return (
    isRecord(value) &&
    typeof value.region === 'string' &&
    meshRegions.has(value.region) &&
    isNonNegativeInteger(value.element_count) &&
    isFiniteNumber(value.target_area_m2) &&
    value.target_area_m2 > 0 &&
    isFiniteNumber(value.total_area_m2) &&
    value.total_area_m2 >= 0
  )
}

function isWarning(value: unknown): value is { code: string; message: string } {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    warningCodes.has(value.code) &&
    isNonEmptyString(value.message)
  )
}

function isManifest(
  value: unknown,
): value is PandaMeshResult['model_manifest'] {
  return (
    isRecord(value) &&
    value.model_id === PANDA_MESH_MODEL_ID &&
    value.model_version === PANDA_MESH_MODEL_VERSION &&
    value.geometry_model === 'PandaGeometry' &&
    value.interface_model === 'piecewise_linear_circular_interfaces' &&
    value.method === 'constrained_delaunay' &&
    value.element_family === 'first_order_triangles' &&
    value.generator_version === PANDA_MESH_GENERATOR_VERSION &&
    value.fem_compatibility_version === PANDA_MESH_FEM_VERSION &&
    value.quality_target_minimum_angle_deg === 20 &&
    value.mesh_only === true &&
    value.solved_fem_fields === false &&
    value.coordinate_units === 'm' &&
    Array.isArray(value.assumptions) &&
    value.assumptions.length > 0 &&
    value.assumptions.every(isNonEmptyString) &&
    Array.isArray(value.limitations) &&
    value.limitations.length > 0 &&
    value.limitations.every(isNonEmptyString)
  )
}

export function isPandaMeshResult(value: unknown): value is PandaMeshResult {
  if (!isRecord(value) || !isMeshRequest(value.configuration)) {
    return false
  }
  if (!Array.isArray(value.nodes_m) || !isPositiveInteger(value.node_count)) {
    return false
  }
  const nodeCount = value.node_count
  if (
    value.nodes_m.length !== nodeCount ||
    !value.nodes_m.every(isNode) ||
    !Array.isArray(value.elements) ||
    !isPositiveInteger(value.element_count)
  ) {
    return false
  }
  const elementCount = value.element_count
  if (
    value.elements.length !== elementCount ||
    !value.elements.every((element) => isElement(element, nodeCount)) ||
    !value.elements.every((element) =>
      hasNonZeroArea(element, value.nodes_m as [number, number][]),
    ) ||
    !Array.isArray(value.region_tags) ||
    value.region_tags.length !== elementCount ||
    !value.region_tags.every(
      (region) => typeof region === 'string' && meshRegions.has(region),
    ) ||
    !Array.isArray(value.region_summaries) ||
    value.region_summaries.length !== 4 ||
    !value.region_summaries.every(isRegionSummary) ||
    new Set(value.region_summaries.map((summary) => summary.region)).size !==
      4 ||
    !isRecord(value.quality) ||
    !isFiniteNumber(value.quality.minimum_angle_deg) ||
    value.quality.minimum_angle_deg < 0 ||
    value.quality.minimum_angle_deg > 60 ||
    !isFiniteNumber(value.quality.minimum_normalized_quality) ||
    value.quality.minimum_normalized_quality < 0 ||
    value.quality.minimum_normalized_quality > 1 ||
    !isFiniteNumber(value.quality.mean_normalized_quality) ||
    value.quality.mean_normalized_quality < 0 ||
    value.quality.mean_normalized_quality > 1 ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every(isWarning) ||
    !isManifest(value.model_manifest)
  ) {
    return false
  }

  const tagCounts = new Map<string, number>()
  for (const region of value.region_tags as string[]) {
    tagCounts.set(region, (tagCounts.get(region) ?? 0) + 1)
  }
  const summaryCounts = new Map<string, number>(
    value.region_summaries.map((summary) => [
      summary.region,
      summary.element_count,
    ]),
  )
  return (
    [...meshRegions].every(
      (region) =>
        (tagCounts.get(region) ?? 0) > 0 &&
        tagCounts.get(region) === summaryCounts.get(region),
    ) &&
    [...summaryCounts.values()].reduce((sum, count) => sum + count, 0) ===
      value.element_count
  )
}

function jsonValuesMatch(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) {
    return true
  }
  if (Array.isArray(first) || Array.isArray(second)) {
    return (
      Array.isArray(first) &&
      Array.isArray(second) &&
      first.length === second.length &&
      first.every((entry, index) => jsonValuesMatch(entry, second[index]))
    )
  }
  if (!isRecord(first) || !isRecord(second)) {
    return false
  }
  const firstKeys = Object.keys(first).sort()
  const secondKeys = Object.keys(second).sort()
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every(
      (key, index) =>
        key === secondKeys[index] && jsonValuesMatch(first[key], second[key]),
    )
  )
}

export function pandaMeshRequestsMatch(
  first: PandaMeshRequest,
  second: PandaMeshRequest,
) {
  return jsonValuesMatch(first, second)
}

export function parsePandaMeshGeometry(values: PandaFieldFormValues): {
  request: PandaMeshRequest | null
  fieldErrors: PandaGeometryFieldErrors
} {
  const parsed = parsePandaGeometryValues(values)
  return {
    request:
      parsed.geometry === null
        ? null
        : { geometry: parsed.geometry, refinement_level: 0 },
    fieldErrors: parsed.fieldErrors,
  }
}
