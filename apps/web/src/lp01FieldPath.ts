import type { FibrePath } from './fibreShowcase'
import { sampleFibrePathFrames } from './fibreShowcase'
import type { ModeProfileData } from './FibreGeometryView'
import type { ScalarModeFieldData } from './scalarMode'

export const LP01_PATH_SAMPLE_COUNT = 129
export const LP01_MAX_PROFILE_POINTS = 65
export const LP01_MAX_VERTEX_COUNT =
  LP01_PATH_SAMPLE_COUNT * LP01_MAX_PROFILE_POINTS * 2

export type LP01PathFieldGeometry = {
  positions: Float32Array
  normalizedField: Float32Array
  normalizedIntensity: Float32Array
  indices: Uint16Array
  pathSampleCount: number
  profileSampleCount: number
  vertexCount: number
  triangleCount: number
  estimatedBytes: number
  modeFieldRadius: number
}

export type ScalarLPPathFieldGeometry = LP01PathFieldGeometry

type PathFieldProfileData = {
  gridPoints: number
  xUm: number[]
  yUm: number[]
  normalizedField: number[][]
  normalizedIntensity: number[][]
}

const geometryCache = new WeakMap<
  ModeProfileData,
  WeakMap<FibrePath, Map<string, LP01PathFieldGeometry | null>>
>()
const scalarGeometryCache = new WeakMap<
  ScalarModeFieldData,
  WeakMap<FibrePath, Map<string, ScalarLPPathFieldGeometry | null>>
>()

function isNormalizedGrid(
  grid: number[][],
  size: number,
  signed: boolean,
): boolean {
  return (
    Array.isArray(grid) &&
    grid.length === size &&
    grid.every(
      (row) =>
        Array.isArray(row) &&
        row.length === size &&
        row.every(
          (value) =>
            Number.isFinite(value) && value >= (signed ? -1 : 0) && value <= 1,
        ),
    )
  )
}

function isUsableProfile(
  profile: PathFieldProfileData,
  signed: boolean,
): boolean {
  return (
    Number.isSafeInteger(profile.gridPoints) &&
    profile.gridPoints >= 3 &&
    profile.gridPoints <= LP01_MAX_PROFILE_POINTS &&
    profile.gridPoints % 2 === 1 &&
    Array.isArray(profile.xUm) &&
    Array.isArray(profile.yUm) &&
    profile.xUm.length === profile.gridPoints &&
    profile.yUm.length === profile.gridPoints &&
    profile.xUm.every(Number.isFinite) &&
    profile.yUm.every(Number.isFinite) &&
    isNormalizedGrid(profile.normalizedField, profile.gridPoints, signed) &&
    isNormalizedGrid(profile.normalizedIntensity, profile.gridPoints, false) &&
    profile.normalizedField.length === profile.normalizedIntensity.length &&
    profile.normalizedField.every(
      (row, rowIndex) =>
        row.length === profile.normalizedIntensity[rowIndex].length &&
        row.every(
          (field, columnIndex) =>
            Math.abs(
              field ** 2 - profile.normalizedIntensity[rowIndex][columnIndex],
            ) <= 1e-9,
        ),
    )
  )
}

function setVertex(
  geometry: LP01PathFieldGeometry,
  vertexIndex: number,
  position: readonly [number, number, number],
  field: number,
  intensity: number,
): void {
  const offset = vertexIndex * 3
  geometry.positions[offset] = position[0]
  geometry.positions[offset + 1] = position[1]
  geometry.positions[offset + 2] = position[2]
  geometry.normalizedField[vertexIndex] = field
  geometry.normalizedIntensity[vertexIndex] = intensity
}

function addRibbonIndices(
  indices: Uint16Array,
  indexOffset: number,
  vertexOffset: number,
  pathSampleCount: number,
  profileSampleCount: number,
): number {
  let nextIndex = indexOffset

  for (let pathIndex = 0; pathIndex < pathSampleCount - 1; pathIndex += 1) {
    for (
      let profileIndex = 0;
      profileIndex < profileSampleCount - 1;
      profileIndex += 1
    ) {
      const start = vertexOffset + pathIndex * profileSampleCount + profileIndex
      const nextPath = start + profileSampleCount

      indices[nextIndex] = start
      indices[nextIndex + 1] = nextPath
      indices[nextIndex + 2] = start + 1
      indices[nextIndex + 3] = start + 1
      indices[nextIndex + 4] = nextPath
      indices[nextIndex + 5] = nextPath + 1
      nextIndex += 6
    }
  }

  return nextIndex
}

function calculateGeometry(
  profile: PathFieldProfileData,
  path: FibrePath,
  physicalCoreRadiusUm: number,
  visualCoreRadius: number,
  pathSampleCount: number,
  displayRadiusUm: number,
  signed: boolean,
): LP01PathFieldGeometry | null {
  if (
    !isUsableProfile(profile, signed) ||
    !Number.isFinite(physicalCoreRadiusUm) ||
    physicalCoreRadiusUm <= 0 ||
    !Number.isFinite(visualCoreRadius) ||
    visualCoreRadius <= 0 ||
    !Number.isSafeInteger(pathSampleCount) ||
    pathSampleCount < 2 ||
    pathSampleCount > 256 ||
    !Number.isFinite(displayRadiusUm) ||
    displayRadiusUm <= 0
  ) {
    return null
  }

  const frames = sampleFibrePathFrames(path, pathSampleCount)
  if (frames.length !== pathSampleCount) {
    return null
  }

  const profileSampleCount = profile.gridPoints
  const ribbonVertexCount = pathSampleCount * profileSampleCount
  const vertexCount = ribbonVertexCount * 2
  const indexCount = 2 * (pathSampleCount - 1) * (profileSampleCount - 1) * 6
  const coordinateScale = visualCoreRadius / physicalCoreRadiusUm
  const positions = new Float32Array(vertexCount * 3)
  const normalizedField = new Float32Array(vertexCount)
  const normalizedIntensity = new Float32Array(vertexCount)
  const indices = new Uint16Array(indexCount)
  const centerIndex = (profileSampleCount - 1) / 2
  const geometry: LP01PathFieldGeometry = {
    positions,
    normalizedField,
    normalizedIntensity,
    indices,
    pathSampleCount,
    profileSampleCount,
    vertexCount,
    triangleCount: indexCount / 3,
    estimatedBytes:
      positions.byteLength +
      normalizedField.byteLength +
      normalizedIntensity.byteLength +
      indices.byteLength,
    modeFieldRadius: displayRadiusUm * coordinateScale,
  }

  for (let pathIndex = 0; pathIndex < frames.length; pathIndex += 1) {
    const frame = frames[pathIndex]

    for (
      let profileIndex = 0;
      profileIndex < profileSampleCount;
      profileIndex += 1
    ) {
      const normalOffset = profile.xUm[profileIndex] * coordinateScale
      const normalVertex = pathIndex * profileSampleCount + profileIndex
      setVertex(
        geometry,
        normalVertex,
        [
          frame.position[0] + frame.normal[0] * normalOffset,
          frame.position[1] + frame.normal[1] * normalOffset,
          frame.position[2] + frame.normal[2] * normalOffset,
        ],
        profile.normalizedField[centerIndex][profileIndex],
        profile.normalizedIntensity[centerIndex][profileIndex],
      )

      const binormalOffset = profile.yUm[profileIndex] * coordinateScale
      const binormalVertex =
        ribbonVertexCount + pathIndex * profileSampleCount + profileIndex
      setVertex(
        geometry,
        binormalVertex,
        [
          frame.position[0] + frame.binormal[0] * binormalOffset,
          frame.position[1] + frame.binormal[1] * binormalOffset,
          frame.position[2] + frame.binormal[2] * binormalOffset,
        ],
        profile.normalizedField[profileIndex][centerIndex],
        profile.normalizedIntensity[profileIndex][centerIndex],
      )
    }
  }

  const nextIndex = addRibbonIndices(
    indices,
    0,
    0,
    pathSampleCount,
    profileSampleCount,
  )
  addRibbonIndices(
    indices,
    nextIndex,
    ribbonVertexCount,
    pathSampleCount,
    profileSampleCount,
  )

  return geometry
}

export function getLP01PathFieldGeometry(
  profile: ModeProfileData,
  path: FibrePath,
  physicalCoreRadiusUm: number,
  visualCoreRadius: number,
  pathSampleCount = LP01_PATH_SAMPLE_COUNT,
): LP01PathFieldGeometry | null {
  let pathCache = geometryCache.get(profile)
  if (pathCache === undefined) {
    pathCache = new WeakMap()
    geometryCache.set(profile, pathCache)
  }

  let inputCache = pathCache.get(path)
  if (inputCache === undefined) {
    inputCache = new Map()
    pathCache.set(path, inputCache)
  }

  const key = `${physicalCoreRadiusUm}:${visualCoreRadius}:${pathSampleCount}`
  const cached = inputCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const geometry = calculateGeometry(
    profile,
    path,
    physicalCoreRadiusUm,
    visualCoreRadius,
    pathSampleCount,
    profile.modeFieldRadiusUm,
    false,
  )
  inputCache.set(key, geometry)
  return geometry
}

export function getScalarLPPathFieldGeometry(
  profile: ScalarModeFieldData,
  path: FibrePath,
  physicalCoreRadiusUm: number,
  visualCoreRadius: number,
  pathSampleCount = LP01_PATH_SAMPLE_COUNT,
): ScalarLPPathFieldGeometry | null {
  let pathCache = scalarGeometryCache.get(profile)
  if (pathCache === undefined) {
    pathCache = new WeakMap()
    scalarGeometryCache.set(profile, pathCache)
  }

  let inputCache = pathCache.get(path)
  if (inputCache === undefined) {
    inputCache = new Map()
    pathCache.set(path, inputCache)
  }

  const key = `${physicalCoreRadiusUm}:${visualCoreRadius}:${pathSampleCount}`
  const cached = inputCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const geometry = calculateGeometry(
    profile,
    path,
    physicalCoreRadiusUm,
    visualCoreRadius,
    pathSampleCount,
    profile.coreRadiusUm,
    true,
  )
  inputCache.set(key, geometry)
  return geometry
}
