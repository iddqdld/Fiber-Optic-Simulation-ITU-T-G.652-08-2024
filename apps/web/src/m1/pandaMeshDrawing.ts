import type { PandaMeshResult } from './pandaMeshModel'

export const MESH_CANVAS_WIDTH = 720
export const MESH_CANVAS_HEIGHT = 620
export const MESH_ZOOM_MIN = 0.5
export const MESH_ZOOM_MAX = 4
export const MESH_ZOOM_STEP = 0.05

export type PandaMeshRegion = 'cladding' | 'core' | 'sap_1' | 'sap_2'

type PathCommand =
  | { kind: 'moveTo'; x: number; y: number }
  | { kind: 'lineTo'; x: number; y: number }
  | { kind: 'closePath' }

type RetainedPath = {
  path: Path2D | null
  commands: PathCommand[] | null
}

type EdgeRecord = {
  first: number
  second: number
  count: number
  regions: Set<PandaMeshRegion>
}

export type PandaMeshDrawingGeometry = {
  claddingRadiusM: number
  regionPaths: Record<PandaMeshRegion, RetainedPath>
  allEdges: RetainedPath
  interfaceEdges: RetainedPath
  outerEdges: RetainedPath
  nodeCount: number
  elementCount: number
  edgeCount: number
  interfaceEdgeCount: number
  outerEdgeCount: number
}

export type PandaMeshDrawView = {
  zoom: number
  panX: number
  panY: number
}

type PathBuilder = {
  retained: RetainedPath
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  closePath: () => void
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

export function buildPandaMeshDrawingGeometry(
  result: PandaMeshResult,
): PandaMeshDrawingGeometry {
  const regionBuilders: Record<PandaMeshRegion, PathBuilder> = {
    cladding: createPathBuilder(),
    core: createPathBuilder(),
    sap_1: createPathBuilder(),
    sap_2: createPathBuilder(),
  }
  const allEdges = createPathBuilder()
  const interfaceEdges = createPathBuilder()
  const outerEdges = createPathBuilder()
  const edgeMap = new Map<string, EdgeRecord>()

  result.elements.forEach((element, index) => {
    const region = result.region_tags[index] as PandaMeshRegion
    addTrianglePath(regionBuilders[region], result.nodes_m, element)
    for (const [first, second] of [
      [element[0], element[1]],
      [element[1], element[2]],
      [element[2], element[0]],
    ] as const) {
      const key = edgeKey(first, second)
      const existing = edgeMap.get(key)
      if (existing) {
        existing.count += 1
        existing.regions.add(region)
      } else {
        edgeMap.set(key, {
          first: Math.min(first, second),
          second: Math.max(first, second),
          count: 1,
          regions: new Set([region]),
        })
      }
    }
  })

  let interfaceEdgeCount = 0
  let outerEdgeCount = 0
  for (const edge of edgeMap.values()) {
    addEdgePath(allEdges, result.nodes_m, edge)
    if (edge.regions.size > 1) {
      interfaceEdgeCount += 1
      addEdgePath(interfaceEdges, result.nodes_m, edge)
    }
    if (edge.count === 1) {
      outerEdgeCount += 1
      addEdgePath(outerEdges, result.nodes_m, edge)
    }
  }

  return {
    claddingRadiusM: result.configuration.geometry.cladding_radius_m,
    regionPaths: {
      cladding: regionBuilders.cladding.retained,
      core: regionBuilders.core.retained,
      sap_1: regionBuilders.sap_1.retained,
      sap_2: regionBuilders.sap_2.retained,
    },
    allEdges: allEdges.retained,
    interfaceEdges: interfaceEdges.retained,
    outerEdges: outerEdges.retained,
    nodeCount: result.node_count,
    elementCount: result.element_count,
    edgeCount: edgeMap.size,
    interfaceEdgeCount,
    outerEdgeCount,
  }
}

function drawCommands(
  context: CanvasRenderingContext2D,
  commands: PathCommand[],
  project: (x: number, y: number) => [number, number],
) {
  context.beginPath()
  for (const command of commands) {
    if (command.kind === 'moveTo') {
      const [x, y] = project(command.x, command.y)
      context.moveTo(x, y)
    } else if (command.kind === 'lineTo') {
      const [x, y] = project(command.x, command.y)
      context.lineTo(x, y)
    } else {
      context.closePath()
    }
  }
}

function drawRetainedPath(
  context: CanvasRenderingContext2D,
  retained: RetainedPath,
  project: (x: number, y: number) => [number, number],
  operation: 'fill' | 'stroke',
) {
  if (retained.path !== null) {
    context[operation](retained.path)
    return
  }
  if (retained.commands !== null) {
    drawCommands(context, retained.commands, project)
    context[operation]()
  }
}

function canvasProject(
  x: number,
  y: number,
  width: number,
  height: number,
  geometry: PandaMeshDrawingGeometry,
  view: PandaMeshDrawView,
): [number, number] {
  const scale = Math.min(width, height) / (2 * geometry.claddingRadiusM * 1.08)
  return [
    width / 2 + view.panX + x * scale * view.zoom,
    height / 2 + view.panY - y * scale * view.zoom,
  ]
}

export function drawPandaMesh(
  context: CanvasRenderingContext2D,
  geometry: PandaMeshDrawingGeometry,
  view: PandaMeshDrawView,
  width = MESH_CANVAS_WIDTH,
  height = MESH_CANVAS_HEIGHT,
) {
  const project = (x: number, y: number) =>
    canvasProject(x, y, width, height, geometry, view)
  const scale = Math.min(width, height) / (2 * geometry.claddingRadiusM * 1.08)
  const canTransform = typeof context.setTransform === 'function'

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#0b1118'
  context.fillRect(0, 0, width, height)
  context.save()
  if (canTransform) {
    context.setTransform(
      scale * view.zoom,
      0,
      0,
      -scale * view.zoom,
      width / 2 + view.panX,
      height / 2 + view.panY,
    )
    context.fillStyle = '#1d2b38'
    drawRetainedPath(context, geometry.regionPaths.cladding, project, 'fill')
    context.fillStyle = '#276f8e'
    drawRetainedPath(context, geometry.regionPaths.core, project, 'fill')
    context.fillStyle = '#917035'
    drawRetainedPath(context, geometry.regionPaths.sap_1, project, 'fill')
    context.fillStyle = '#5d7d4c'
    drawRetainedPath(context, geometry.regionPaths.sap_2, project, 'fill')
    context.strokeStyle = '#617385'
    context.lineWidth = 0.35 / (scale * view.zoom)
    drawRetainedPath(context, geometry.allEdges, project, 'stroke')
    context.strokeStyle = '#d8edf7'
    context.lineWidth = 1.1 / (scale * view.zoom)
    drawRetainedPath(context, geometry.interfaceEdges, project, 'stroke')
    context.strokeStyle = '#f2f7fb'
    context.lineWidth = 1.6 / (scale * view.zoom)
    drawRetainedPath(context, geometry.outerEdges, project, 'stroke')
  } else {
    context.fillStyle = '#1d2b38'
    drawRetainedPath(context, geometry.regionPaths.cladding, project, 'fill')
    context.fillStyle = '#276f8e'
    drawRetainedPath(context, geometry.regionPaths.core, project, 'fill')
    context.fillStyle = '#917035'
    drawRetainedPath(context, geometry.regionPaths.sap_1, project, 'fill')
    context.fillStyle = '#5d7d4c'
    drawRetainedPath(context, geometry.regionPaths.sap_2, project, 'fill')
    context.strokeStyle = '#617385'
    context.lineWidth = 0.35
    drawRetainedPath(context, geometry.allEdges, project, 'stroke')
    context.strokeStyle = '#d8edf7'
    context.lineWidth = 1.1
    drawRetainedPath(context, geometry.interfaceEdges, project, 'stroke')
    context.strokeStyle = '#f2f7fb'
    context.lineWidth = 1.6
    drawRetainedPath(context, geometry.outerEdges, project, 'stroke')
  }
  context.restore()
}
