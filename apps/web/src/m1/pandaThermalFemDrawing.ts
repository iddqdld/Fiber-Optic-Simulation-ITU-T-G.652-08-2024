import type { operations } from '../../../../packages/shared_schemas/generated/api'

export type PandaThermalFemResult =
  operations['calculate_panda_thermal_fem']['responses'][200]['content']['application/json']

export const THERMAL_FEM_CANVAS_WIDTH = 720
export const THERMAL_FEM_CANVAS_HEIGHT = 620
export const THERMAL_FEM_ZOOM_MIN = 0.5
export const THERMAL_FEM_ZOOM_MAX = 4
export const THERMAL_FEM_ZOOM_STEP = 0.05
export const THERMAL_FEM_BIN_COUNT = 21

export type ThermalFemField =
  | 'displacement_x_m'
  | 'displacement_y_m'
  | 'displacement_magnitude_m'
  | 'element_strain_xx'
  | 'element_strain_yy'
  | 'element_strain_zz'
  | 'element_strain_xy'
  | 'element_stress_xx_pa'
  | 'element_stress_yy_pa'
  | 'element_stress_zz_pa'
  | 'element_stress_xy_pa'
  | 'element_principal_max_pa'
  | 'element_principal_min_pa'
  | 'element_principal_difference_pa'
  | 'element_principal_axis_angle_rad'
  | 'region'

export type ThermalFemScaleKind = 'signed' | 'nonnegative' | 'region'

export type ThermalFemFieldDefinition = {
  value: ThermalFemField
  label: string
  kind: ThermalFemScaleKind
  unit: string
  conversion: string
  factor: number
}

export const THERMAL_FEM_FIELD_OPTIONS: readonly ThermalFemFieldDefinition[] = [
  {
    value: 'element_principal_difference_pa',
    label: 'Principal stress difference (σ₁ − σ₂)',
    kind: 'nonnegative',
    unit: 'MPa',
    conversion: 'Pa × 1e−6',
    factor: 1e-6,
  },
  {
    value: 'displacement_x_m',
    label: 'Displacement uₓ',
    kind: 'signed',
    unit: 'µm',
    conversion: 'm × 1e6',
    factor: 1e6,
  },
  {
    value: 'displacement_y_m',
    label: 'Displacement uᵧ',
    kind: 'signed',
    unit: 'µm',
    conversion: 'm × 1e6',
    factor: 1e6,
  },
  {
    value: 'displacement_magnitude_m',
    label: 'Displacement magnitude |u|',
    kind: 'nonnegative',
    unit: 'µm',
    conversion: 'm × 1e6',
    factor: 1e6,
  },
  {
    value: 'element_strain_xx',
    label: 'Strain εₓₓ',
    kind: 'signed',
    unit: '1',
    conversion: 'dimensionless; unchanged',
    factor: 1,
  },
  {
    value: 'element_strain_yy',
    label: 'Strain εᵧᵧ',
    kind: 'signed',
    unit: '1',
    conversion: 'dimensionless; unchanged',
    factor: 1,
  },
  {
    value: 'element_strain_zz',
    label: 'Strain εzz',
    kind: 'signed',
    unit: '1',
    conversion: 'dimensionless; unchanged',
    factor: 1,
  },
  {
    value: 'element_strain_xy',
    label: 'Strain εₓᵧ',
    kind: 'signed',
    unit: '1',
    conversion: 'dimensionless; unchanged',
    factor: 1,
  },
  {
    value: 'element_stress_xx_pa',
    label: 'Stress σₓₓ',
    kind: 'signed',
    unit: 'MPa',
    conversion: 'Pa × 1e−6',
    factor: 1e-6,
  },
  {
    value: 'element_stress_yy_pa',
    label: 'Stress σᵧᵧ',
    kind: 'signed',
    unit: 'MPa',
    conversion: 'Pa × 1e−6',
    factor: 1e-6,
  },
  {
    value: 'element_stress_zz_pa',
    label: 'Stress σzz',
    kind: 'signed',
    unit: 'MPa',
    conversion: 'Pa × 1e−6',
    factor: 1e-6,
  },
  {
    value: 'element_stress_xy_pa',
    label: 'Stress σₓᵧ',
    kind: 'signed',
    unit: 'MPa',
    conversion: 'Pa × 1e−6',
    factor: 1e-6,
  },
  {
    value: 'element_principal_max_pa',
    label: 'Principal stress maximum',
    kind: 'signed',
    unit: 'MPa',
    conversion: 'Pa × 1e−6',
    factor: 1e-6,
  },
  {
    value: 'element_principal_min_pa',
    label: 'Principal stress minimum',
    kind: 'signed',
    unit: 'MPa',
    conversion: 'Pa × 1e−6',
    factor: 1e-6,
  },
  {
    value: 'element_principal_axis_angle_rad',
    label: 'Principal-axis angle ψ',
    kind: 'signed',
    unit: '°',
    conversion: 'rad × 180/π',
    factor: 180 / Math.PI,
  },
  {
    value: 'region',
    label: 'Mesh regions',
    kind: 'region',
    unit: 'region labels',
    conversion: 'categorical; no numeric conversion',
    factor: 1,
  },
] as const

export const DEFAULT_THERMAL_FEM_FIELD: ThermalFemField =
  'element_principal_difference_pa'

type PandaMeshRegion = 'cladding' | 'core' | 'sap_1' | 'sap_2'
type PathCommand =
  | { kind: 'moveTo'; x: number; y: number }
  | { kind: 'lineTo'; x: number; y: number }
  | { kind: 'closePath' }

type RetainedPath = {
  path: Path2D | null
  commands: PathCommand[] | null
}

type PathBuilder = {
  retained: RetainedPath
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  closePath: () => void
}

type EdgeRecord = {
  first: number
  second: number
  count: number
  regions: Set<PandaMeshRegion>
}

export type ThermalFemDisplayScale = {
  kind: ThermalFemScaleKind
  minimum: number
  maximum: number
  unit: string
  conversion: string
}

export type ThermalFemBin = {
  index: number
  color: string
  lower: number
  upper: number
  count: number
  path: RetainedPath
}

export type PandaThermalFemDrawingGeometry = {
  field: ThermalFemField
  definition: ThermalFemFieldDefinition
  scale: ThermalFemDisplayScale
  bins: readonly ThermalFemBin[]
  interfaceEdges: RetainedPath
  outerEdges: RetainedPath
  allEdges: RetainedPath
  claddingRadiusM: number
  nodeCount: number
  elementCount: number
  interfaceEdgeCount: number
  outerEdgeCount: number
}

export type ThermalFemDrawView = {
  zoom: number
  panX: number
  panY: number
  showMeshEdges?: boolean
}

function createPathBuilder(): PathBuilder {
  const commands: PathCommand[] = []
  const path =
    typeof Path2D === 'undefined'
      ? null
      : (() => {
          try {
            return new Path2D()
          } catch {
            return null
          }
        })()

  return {
    retained: { path, commands: path === null ? commands : null },
    moveTo(x, y) {
      path?.moveTo(x, y)
      if (path === null) commands.push({ kind: 'moveTo', x, y })
    },
    lineTo(x, y) {
      path?.lineTo(x, y)
      if (path === null) commands.push({ kind: 'lineTo', x, y })
    },
    closePath() {
      path?.closePath()
      if (path === null) commands.push({ kind: 'closePath' })
    },
  }
}

function fieldDefinition(field: ThermalFemField): ThermalFemFieldDefinition {
  return THERMAL_FEM_FIELD_OPTIONS.find((option) => option.value === field)!
}

function finiteValues(values: readonly number[]) {
  return values.filter((value) => Number.isFinite(value))
}

export function getThermalFemFieldValues(
  result: PandaThermalFemResult,
  field: ThermalFemField,
): readonly number[] | readonly PandaMeshRegion[] {
  if (field === 'region') {
    return result.mesh.region_tags as readonly PandaMeshRegion[]
  }
  if (field === 'displacement_x_m' || field === 'displacement_y_m') {
    const nodalValues = result[field]
    return result.mesh.elements.map(
      (element) =>
        (nodalValues[element[0]] +
          nodalValues[element[1]] +
          nodalValues[element[2]]) /
        3,
    )
  }
  if (field === 'displacement_magnitude_m') {
    const nodalMagnitude = result.displacement_x_m.map((value, index) =>
      Math.hypot(value, result.displacement_y_m[index]),
    )
    return result.mesh.elements.map(
      (element) =>
        (nodalMagnitude[element[0]] +
          nodalMagnitude[element[1]] +
          nodalMagnitude[element[2]]) /
        3,
    )
  }
  return result[field] as readonly number[]
}

export function getThermalFemDisplayValues(
  result: PandaThermalFemResult,
  field: ThermalFemField,
): readonly number[] | readonly PandaMeshRegion[] {
  const definition = fieldDefinition(field)
  const values = getThermalFemFieldValues(result, field)
  if (definition.kind === 'region') {
    return values as readonly PandaMeshRegion[]
  }
  return (values as readonly number[]).map((value) => value * definition.factor)
}

export function buildThermalFemDisplayScale(
  result: PandaThermalFemResult,
  field: ThermalFemField,
): ThermalFemDisplayScale {
  const definition = fieldDefinition(field)
  if (definition.kind === 'region') {
    return {
      kind: 'region',
      minimum: 0,
      maximum: 3,
      unit: definition.unit,
      conversion: definition.conversion,
    }
  }
  const values = finiteValues(
    getThermalFemDisplayValues(result, field) as readonly number[],
  )
  const extent =
    definition.kind === 'signed'
      ? Math.max(...values.map((value) => Math.abs(value)), 0)
      : Math.max(...values, 0)
  return {
    kind: definition.kind,
    minimum: definition.kind === 'signed' ? -extent : 0,
    maximum: extent,
    unit: definition.unit,
    conversion: definition.conversion,
  }
}

export function thermalFemBinIndex(
  value: number,
  scale: ThermalFemDisplayScale,
  binCount = THERMAL_FEM_BIN_COUNT,
): number {
  if (scale.kind === 'region') {
    return Math.max(0, Math.min(3, Math.round(value)))
  }
  if (!Number.isFinite(value) || scale.maximum === 0) {
    return scale.kind === 'signed' ? Math.floor(binCount / 2) : 0
  }
  const normalized =
    scale.kind === 'signed'
      ? (value - scale.minimum) / (scale.maximum - scale.minimum)
      : value / scale.maximum
  return Math.max(0, Math.min(binCount - 1, Math.floor(normalized * binCount)))
}

function interpolate(
  first: readonly number[],
  second: readonly number[],
  amount: number,
) {
  return first.map((value, index) =>
    Math.round(value + (second[index] - value) * amount),
  )
}

function rgb(value: readonly number[]) {
  return `rgb(${value.join(' ')})`
}

function binColor(kind: ThermalFemScaleKind, index: number, binCount: number) {
  if (kind === 'region') {
    return ['#334e68', '#277da1', '#c68c36', '#6a994e'][index] ?? '#64748b'
  }
  const amount = binCount <= 1 ? 0.5 : index / (binCount - 1)
  if (kind === 'signed') {
    return amount <= 0.5
      ? rgb(interpolate([37, 99, 235], [241, 245, 249], amount * 2))
      : rgb(interpolate([241, 245, 249], [220, 38, 38], (amount - 0.5) * 2))
  }
  return rgb(interpolate([226, 232, 240], [234, 88, 12], amount))
}

function edgeKey(first: number, second: number) {
  return first < second ? `${first}:${second}` : `${second}:${first}`
}

function addTrianglePath(
  builder: PathBuilder,
  nodes: readonly (readonly [number, number])[],
  element: readonly [number, number, number],
) {
  const first = nodes[element[0]]
  const second = nodes[element[1]]
  const third = nodes[element[2]]
  builder.moveTo(first[0], first[1])
  builder.lineTo(second[0], second[1])
  builder.lineTo(third[0], third[1])
  builder.closePath()
}

function addEdgePath(
  builder: PathBuilder,
  nodes: readonly (readonly [number, number])[],
  edge: EdgeRecord,
) {
  const first = nodes[edge.first]
  const second = nodes[edge.second]
  builder.moveTo(first[0], first[1])
  builder.lineTo(second[0], second[1])
}

function buildBins(
  field: ThermalFemField,
  definition: ThermalFemFieldDefinition,
  scale: ThermalFemDisplayScale,
) {
  const count = definition.kind === 'region' ? 4 : THERMAL_FEM_BIN_COUNT
  const width =
    definition.kind === 'region' ? 1 : (scale.maximum - scale.minimum) / count
  return Array.from({ length: count }, (_, index) => ({
    index,
    color: binColor(definition.kind, index, count),
    lower: definition.kind === 'region' ? index : scale.minimum + width * index,
    upper:
      definition.kind === 'region'
        ? index
        : scale.minimum + width * (index + 1),
    count: 0,
    path: createPathBuilder().retained,
  })) satisfies ThermalFemBin[]
}

export function buildPandaThermalFemDrawingGeometry(
  result: PandaThermalFemResult,
  field: ThermalFemField = DEFAULT_THERMAL_FEM_FIELD,
): PandaThermalFemDrawingGeometry {
  const definition = fieldDefinition(field)
  const scale = buildThermalFemDisplayScale(result, field)
  const bins = buildBins(field, definition, scale)
  const binBuilders = bins.map((bin) => ({
    ...bin,
    builder: createPathBuilder(),
  }))
  const values = getThermalFemDisplayValues(result, field)
  const edgeMap = new Map<string, EdgeRecord>()

  result.mesh.elements.forEach((element, elementIndex) => {
    const rawValue = values[elementIndex]
    const value =
      definition.kind === 'region'
        ? ['cladding', 'core', 'sap_1', 'sap_2'].indexOf(rawValue as string)
        : (rawValue as number)
    const bin =
      binBuilders[thermalFemBinIndex(value, scale, binBuilders.length)]
    if (bin === undefined) return
    addTrianglePath(bin.builder, result.mesh.nodes_m, element)
    bin.count += 1
    for (const [first, second] of [
      [element[0], element[1]],
      [element[1], element[2]],
      [element[2], element[0]],
    ] as const) {
      const key = edgeKey(first, second)
      const existing = edgeMap.get(key)
      if (existing) {
        existing.count += 1
        existing.regions.add(
          result.mesh.region_tags[elementIndex] as PandaMeshRegion,
        )
      } else {
        edgeMap.set(key, {
          first: Math.min(first, second),
          second: Math.max(first, second),
          count: 1,
          regions: new Set([
            result.mesh.region_tags[elementIndex] as PandaMeshRegion,
          ]),
        })
      }
    }
  })

  const interfaceBuilder = createPathBuilder()
  const outerBuilder = createPathBuilder()
  const allBuilder = createPathBuilder()
  const nodes = result.mesh.nodes_m
  let interfaceEdgeCount = 0
  let outerEdgeCount = 0
  for (const edge of edgeMap.values()) {
    addEdgePath(allBuilder, nodes, edge)
    if (edge.regions.size > 1) {
      interfaceEdgeCount += 1
      addEdgePath(interfaceBuilder, nodes, edge)
    }
    if (edge.count === 1) {
      outerEdgeCount += 1
      addEdgePath(outerBuilder, nodes, edge)
    }
  }

  return {
    field,
    definition,
    scale,
    bins: binBuilders.map(({ builder, ...bin }) => ({
      ...bin,
      path: builder.retained,
    })),
    interfaceEdges: interfaceBuilder.retained,
    outerEdges: outerBuilder.retained,
    allEdges: allBuilder.retained,
    claddingRadiusM: result.configuration.geometry.cladding_radius_m,
    nodeCount: result.mesh.node_count,
    elementCount: result.mesh.element_count,
    interfaceEdgeCount,
    outerEdgeCount,
  }
}

function drawRetainedPath(
  context: CanvasRenderingContext2D,
  retained: RetainedPath,
  operation: 'fill' | 'stroke',
) {
  if (retained.path !== null) {
    context[operation](retained.path)
    return
  }
  if (retained.commands !== null) {
    context.beginPath()
    for (const command of retained.commands) {
      if (command.kind === 'moveTo') context.moveTo(command.x, command.y)
      if (command.kind === 'lineTo') context.lineTo(command.x, command.y)
      if (command.kind === 'closePath') context.closePath()
    }
    context[operation]()
  }
}

export function drawPandaThermalFem(
  context: CanvasRenderingContext2D,
  geometry: PandaThermalFemDrawingGeometry,
  view: ThermalFemDrawView,
  width = THERMAL_FEM_CANVAS_WIDTH,
  height = THERMAL_FEM_CANVAS_HEIGHT,
) {
  const scale = Math.min(width, height) / (2 * geometry.claddingRadiusM * 1.08)
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#0b1118'
  context.fillRect(0, 0, width, height)
  context.save()
  context.setTransform(
    scale * view.zoom,
    0,
    0,
    -scale * view.zoom,
    width / 2 + view.panX,
    height / 2 + view.panY,
  )
  for (const bin of geometry.bins) {
    context.fillStyle = bin.color
    drawRetainedPath(context, bin.path, 'fill')
  }
  if (view.showMeshEdges) {
    context.strokeStyle = 'rgb(20 34 48 / 46%)'
    context.lineWidth = 0.35 / (scale * view.zoom)
    drawRetainedPath(context, geometry.allEdges, 'stroke')
  }
  context.strokeStyle = '#e3edf5'
  context.lineWidth = 1.2 / (scale * view.zoom)
  drawRetainedPath(context, geometry.interfaceEdges, 'stroke')
  context.strokeStyle = '#ffffff'
  context.lineWidth = 1.8 / (scale * view.zoom)
  drawRetainedPath(context, geometry.outerEdges, 'stroke')
  context.restore()
}
