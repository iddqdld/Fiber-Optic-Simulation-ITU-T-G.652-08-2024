import { useEffect, useState, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const DEFAULT_VISUAL_LENGTH = 8
const MIN_VISUAL_LENGTH = 4
const MAX_VISUAL_LENGTH = 12
const CLADDING_RADIUS = 0.85
const DEFAULT_CORE_RADIUS = 0.36
const MIN_CORE_RADIUS = 0.22
const MAX_CORE_RADIUS = 0.58
const CYLINDER_SEGMENTS = 48
const HALF_TURN = Math.PI / 2
const DEFAULT_INCIDENCE_ANGLE_DEG = 86
const MIN_INCIDENCE_ANGLE_DEG = 0
const MAX_INCIDENCE_ANGLE_DEG = 89.9
const RAY_THICKNESS = 0.035
const RAY_EDGE_FACTOR = 0.82
const MIN_RAY_SLOPE = 0.18
const MAX_RAY_SLOPE = 0.85
const DEGREES_TO_RADIANS = Math.PI / 180

export type RayGuidance = {
  criticalAngleDeg: number
  modelId: string
  modelVersion: string
}

type RayStatus =
  | 'total_internal_reflection'
  | 'critical_boundary'
  | 'transmission'
  | 'unavailable'

export type FibreGeometryViewProps = {
  coreRadiusUm: number | null
  sectionLengthKm: number | null
  rayGuidance: RayGuidance | null
}

export type FibreGeometrySceneProps = {
  coreRadiusUm: number | null
  visualLengthModelUnits: number
  rayGuidance?: RayGuidance | null
  incidenceAngleDeg?: number
  rayViewEnabled?: boolean
}

type RayPoint = [number, number, number]

type RaySegmentProps = {
  name: string
  start: RayPoint
  end: RayPoint
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function getNormalisedCoreRadius(coreRadiusUm: number | null): number {
  if (coreRadiusUm === null || !Number.isFinite(coreRadiusUm)) {
    return DEFAULT_CORE_RADIUS
  }

  return clamp(coreRadiusUm / 10, MIN_CORE_RADIUS, MAX_CORE_RADIUS)
}

function getVisualLength(value: number): number {
  return Number.isFinite(value)
    ? clamp(value, MIN_VISUAL_LENGTH, MAX_VISUAL_LENGTH)
    : DEFAULT_VISUAL_LENGTH
}

function isValidRayGuidance(
  guidance: RayGuidance | null | undefined,
): guidance is RayGuidance {
  return (
    guidance !== null &&
    guidance !== undefined &&
    Number.isFinite(guidance.criticalAngleDeg) &&
    guidance.criticalAngleDeg > 0 &&
    guidance.criticalAngleDeg < 90 &&
    typeof guidance.modelId === 'string' &&
    guidance.modelId.trim().length > 0 &&
    typeof guidance.modelVersion === 'string' &&
    guidance.modelVersion.trim().length > 0
  )
}

function getRayStatus(
  incidenceAngleDeg: number,
  guidance: RayGuidance | null | undefined,
): RayStatus {
  if (!Number.isFinite(incidenceAngleDeg) || !isValidRayGuidance(guidance)) {
    return 'unavailable'
  }

  if (incidenceAngleDeg > guidance.criticalAngleDeg) {
    return 'total_internal_reflection'
  }

  if (incidenceAngleDeg === guidance.criticalAngleDeg) {
    return 'critical_boundary'
  }

  return 'transmission'
}

function formatEnteredValue(value: number | null, unit: string): string {
  return value === null || !Number.isFinite(value)
    ? 'Not entered'
    : `${value} ${unit}`
}

function formatDegrees(value: number): string {
  return `${value.toFixed(1)}°`
}

function getSegmentGeometry(start: RayPoint, end: RayPoint) {
  const deltaX = end[0] - start[0]
  const deltaY = end[1] - start[1]

  return {
    length: Math.hypot(deltaX, deltaY),
    position: [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      (start[2] + end[2]) / 2,
    ] as RayPoint,
    rotation: [0, 0, Math.atan2(deltaY, deltaX)] as RayPoint,
  }
}

function RaySegment({ name, start, end }: RaySegmentProps) {
  const { length, position, rotation } = getSegmentGeometry(start, end)

  return (
    <mesh name={name} position={position} rotation={rotation}>
      <boxGeometry
        name={`${name}-geometry`}
        args={[length, RAY_THICKNESS, RAY_THICKNESS]}
      />
      <meshBasicMaterial
        name="educational-ray-material"
        color="#ffe066"
        toneMapped={false}
      />
    </mesh>
  )
}

function getRaySlope(incidenceAngleDeg: number): number {
  return clamp(
    Math.tan((90 - incidenceAngleDeg) * DEGREES_TO_RADIANS),
    MIN_RAY_SLOPE,
    MAX_RAY_SLOPE,
  )
}

function ReflectedRay({
  coreRadius,
  visualLength,
  incidenceAngleDeg,
}: {
  coreRadius: number
  visualLength: number
  incidenceAngleDeg: number
}) {
  const startX = -visualLength / 2 + 0.25
  const endX = visualLength / 2 - 0.25
  const upperY = coreRadius * RAY_EDGE_FACTOR
  const lowerY = -upperY
  const slope = getRaySlope(incidenceAngleDeg)
  const segments: ReactNode[] = []
  let currentX = startX
  let currentY = lowerY
  let targetY = upperY
  let segmentIndex = 0

  while (currentX < endX) {
    const nextX = Math.min(
      endX,
      currentX + Math.abs(targetY - currentY) / slope,
    )
    const nextY =
      currentY + (targetY > currentY ? 1 : -1) * slope * (nextX - currentX)

    segments.push(
      <RaySegment
        key={`tir-${segmentIndex}`}
        name={`educational-ray-tir-segment-${segmentIndex}`}
        start={[currentX, currentY, 0]}
        end={[nextX, nextY, 0]}
      />,
    )

    if (nextX >= endX) {
      break
    }

    currentX = nextX
    currentY = targetY
    targetY = targetY === upperY ? lowerY : upperY
    segmentIndex += 1
  }

  return <group name="educational-ray-tir">{segments}</group>
}

function CriticalRay({
  coreRadius,
  visualLength,
}: {
  coreRadius: number
  visualLength: number
}) {
  return (
    <group name="educational-ray-critical-boundary">
      <RaySegment
        name="educational-ray-critical-boundary-segment"
        start={[-visualLength / 2 + 0.25, coreRadius * 0.98, 0]}
        end={[visualLength / 2 - 0.25, coreRadius * 0.98, 0]}
      />
    </group>
  )
}

function TransmittedRay({
  coreRadius,
  visualLength,
}: {
  coreRadius: number
  visualLength: number
}) {
  const boundaryPoint: RayPoint = [0, coreRadius * 0.98, 0]

  return (
    <group name="educational-ray-transmission">
      <RaySegment
        name="educational-ray-transmission-incident-segment"
        start={[-visualLength / 2 + 0.25, -coreRadius * 0.55, 0]}
        end={boundaryPoint}
      />
      <RaySegment
        name="educational-ray-transmission-exiting-segment"
        start={boundaryPoint}
        end={[visualLength / 2 - 0.25, CLADDING_RADIUS * 0.72, 0]}
      />
    </group>
  )
}

function EducationalRayLayer({
  coreRadius,
  visualLength,
  incidenceAngleDeg,
  guidance,
}: {
  coreRadius: number
  visualLength: number
  incidenceAngleDeg: number
  guidance: RayGuidance | null | undefined
}) {
  const status = getRayStatus(incidenceAngleDeg, guidance)

  if (status === 'total_internal_reflection') {
    return (
      <ReflectedRay
        coreRadius={coreRadius}
        visualLength={visualLength}
        incidenceAngleDeg={incidenceAngleDeg}
      />
    )
  }

  if (status === 'critical_boundary') {
    return <CriticalRay coreRadius={coreRadius} visualLength={visualLength} />
  }

  if (status === 'transmission') {
    return (
      <TransmittedRay coreRadius={coreRadius} visualLength={visualLength} />
    )
  }

  return null
}

function getRayStatusText(
  status: RayStatus,
  incidenceAngleDeg: number,
  guidance: RayGuidance | null,
): string {
  if (status === 'unavailable' || !isValidRayGuidance(guidance)) {
    return 'Ray guidance unavailable: a valid backend critical angle and model manifest are required.'
  }

  const incidence = formatDegrees(incidenceAngleDeg)
  const critical = formatDegrees(guidance.criticalAngleDeg)

  if (status === 'total_internal_reflection') {
    return `Total internal reflection: ${incidence} is above the ${critical} critical angle.`
  }

  if (status === 'critical_boundary') {
    return `Critical boundary: ${incidence} equals the ${critical} critical angle.`
  }

  return `Transmission into cladding: ${incidence} is below the ${critical} critical angle.`
}

type RayGuidancePanelProps = {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  incidenceAngleDeg: number
  onIncidenceAngleChange: (angle: number) => void
  guidance: RayGuidance | null
}

function RayGuidancePanel({
  enabled,
  onEnabledChange,
  incidenceAngleDeg,
  onIncidenceAngleChange,
  guidance,
}: RayGuidancePanelProps) {
  const status = getRayStatus(incidenceAngleDeg, guidance)
  const validGuidance = isValidRayGuidance(guidance)
  const statusText = getRayStatusText(status, incidenceAngleDeg, guidance)

  return (
    <>
      <div className="geometry-layer-control">
        <label htmlFor="educational-ray-view">
          <input
            id="educational-ray-view"
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.currentTarget.checked)}
          />
          Educational ray view
        </label>
      </div>

      {enabled && (
        <>
          <div className="ray-controls">
            <label htmlFor="incidence-angle">
              Incidence angle (degrees, from the interface normal)
            </label>
            <input
              id="incidence-angle"
              type="range"
              min={MIN_INCIDENCE_ANGLE_DEG}
              max={MAX_INCIDENCE_ANGLE_DEG}
              step="0.1"
              value={incidenceAngleDeg}
              onChange={(event) =>
                onIncidenceAngleChange(Number(event.currentTarget.value))
              }
              aria-describedby="ray-angle-help ray-explanation"
            />
            <output
              htmlFor="incidence-angle"
              aria-label="Current incidence angle"
              aria-live="polite"
            >
              {formatDegrees(incidenceAngleDeg)}
            </output>
            <button
              className="ray-boundary-button"
              type="button"
              disabled={!validGuidance}
              onClick={() => {
                if (validGuidance) {
                  onIncidenceAngleChange(guidance.criticalAngleDeg)
                }
              }}
            >
              Set to critical angle
            </button>
            <p id="ray-angle-help">
              Angle measured inside core from boundary normal.
            </p>
          </div>

          <dl className="ray-facts">
            <div>
              <dt>Critical angle</dt>
              <dd>
                {validGuidance
                  ? formatDegrees(guidance.criticalAngleDeg)
                  : 'Unavailable'}
              </dd>
            </div>
            <div>
              <dt>Approximate model</dt>
              <dd className="ray-model">
                {validGuidance
                  ? `${guidance.modelId} (${guidance.modelVersion})`
                  : 'Unavailable'}
              </dd>
            </div>
          </dl>

          <p
            className="ray-status"
            data-state={status}
            role="status"
            aria-live="polite"
          >
            {statusText}
          </p>
          <p id="ray-explanation" className="ray-explanation">
            The incidence angle is measured inside core from the boundary
            normal. Total internal reflection occurs only above the critical
            angle. Status comes from the backend critical angle. The ray path is
            schematic, not longitudinally or radially to scale, and is not a
            full-wave field solution.
          </p>
        </>
      )}
    </>
  )
}

function FibreOrbitControls() {
  const { camera, gl, invalidate } = useThree()
  const { domElement } = gl

  useEffect(() => {
    const controls = new OrbitControls(camera, domElement)
    const requestRender = () => invalidate()
    controls.enableDamping = false
    controls.enablePan = false
    controls.minDistance = 8
    controls.maxDistance = 28
    controls.addEventListener('change', requestRender)
    controls.update()

    return () => {
      controls.removeEventListener('change', requestRender)
      controls.dispose()
    }
  }, [camera, domElement, invalidate])

  return null
}

export function FibreGeometryScene({
  coreRadiusUm,
  visualLengthModelUnits,
  rayGuidance = null,
  incidenceAngleDeg = DEFAULT_INCIDENCE_ANGLE_DEG,
  rayViewEnabled = false,
}: FibreGeometrySceneProps) {
  const coreRadius = getNormalisedCoreRadius(coreRadiusUm)
  const visualLength = getVisualLength(visualLengthModelUnits)
  const coreMaterialProps = rayViewEnabled
    ? { transparent: true, opacity: 0.42, depthWrite: false }
    : {}

  return (
    <group name="fibre-geometry-scene">
      <group rotation={[0, 0, HALF_TURN]}>
        <mesh name="solid-fibre-core">
          <cylinderGeometry
            name="solid-core-geometry"
            args={[coreRadius, coreRadius, visualLength, CYLINDER_SEGMENTS]}
          />
          <meshStandardMaterial
            {...coreMaterialProps}
            name="solid-core-material"
            color="#f4a261"
            roughness={0.42}
            metalness={0.04}
          />
        </mesh>
        <mesh name="illustrative-cladding-shell">
          <cylinderGeometry
            name="illustrative-cladding-geometry"
            args={[
              CLADDING_RADIUS,
              CLADDING_RADIUS,
              visualLength,
              CYLINDER_SEGMENTS,
            ]}
          />
          <meshStandardMaterial
            name="illustrative-cladding-material"
            color="#4f8edb"
            transparent
            opacity={0.24}
            depthWrite={false}
            roughness={0.28}
            metalness={0}
          />
        </mesh>
      </group>
      {rayViewEnabled && (
        <EducationalRayLayer
          coreRadius={coreRadius}
          visualLength={visualLength}
          incidenceAngleDeg={incidenceAngleDeg}
          guidance={rayGuidance}
        />
      )}
    </group>
  )
}

export function FibreGeometryView({
  coreRadiusUm,
  sectionLengthKm,
  rayGuidance,
}: FibreGeometryViewProps) {
  const [visualLength, setVisualLength] = useState(DEFAULT_VISUAL_LENGTH)
  const [rayViewEnabled, setRayViewEnabled] = useState(true)
  const [incidenceAngleDeg, setIncidenceAngleDeg] = useState(
    DEFAULT_INCIDENCE_ANGLE_DEG,
  )

  return (
    <section className="geometry-card" aria-labelledby="fibre-geometry-title">
      <h2 id="fibre-geometry-title">3D fibre geometry</h2>
      <p className="model-note">
        Illustrative geometry. Drag to rotate and scroll or pinch to zoom.
      </p>

      <dl className="geometry-facts">
        <div>
          <dt>Entered core radius</dt>
          <dd>{formatEnteredValue(coreRadiusUm, 'µm')}</dd>
        </div>
        <div>
          <dt>Entered section length</dt>
          <dd>{formatEnteredValue(sectionLengthKm, 'km')}</dd>
        </div>
      </dl>

      <div className="geometry-viewport">
        <Canvas
          role="img"
          aria-label="Illustrative interactive 3D fibre geometry"
          aria-describedby="geometry-scale-note"
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{ position: [10, 6, 12], fov: 42, near: 0.1, far: 100 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          fallback={
            <p role="status">
              3D rendering is unavailable in this browser or device.
            </p>
          }
        >
          <color attach="background" args={['#101827']} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 8, 7]} intensity={1.4} />
          <pointLight position={[-5, -3, 4]} intensity={0.65} />
          <FibreGeometryScene
            coreRadiusUm={coreRadiusUm}
            visualLengthModelUnits={visualLength}
            rayGuidance={rayGuidance}
            incidenceAngleDeg={incidenceAngleDeg}
            rayViewEnabled={rayViewEnabled}
          />
          <FibreOrbitControls />
        </Canvas>
      </div>

      <div className="geometry-controls">
        <label htmlFor="visual-fibre-length">
          Visual fibre length (model units)
        </label>
        <input
          id="visual-fibre-length"
          type="range"
          min={MIN_VISUAL_LENGTH}
          max={MAX_VISUAL_LENGTH}
          step={1}
          value={visualLength}
          onChange={(event) =>
            setVisualLength(Number(event.currentTarget.value))
          }
          aria-describedby="visual-fibre-length-help"
        />
        <output
          htmlFor="visual-fibre-length"
          aria-label="Current visual fibre length"
          aria-live="polite"
        >
          {visualLength} model units
        </output>
        <p id="visual-fibre-length-help">
          Visual-only length; it changes the displayed cylinder and is not a
          physical fibre length.
        </p>
      </div>

      <RayGuidancePanel
        enabled={rayViewEnabled}
        onEnabledChange={setRayViewEnabled}
        incidenceAngleDeg={incidenceAngleDeg}
        onIncidenceAngleChange={setIncidenceAngleDeg}
        guidance={rayGuidance}
      />

      <p id="geometry-scale-note" className="geometry-note">
        Radial dimensions are normalized for visibility. The cladding shell is
        illustrative because no cladding diameter is configured. Longitudinal
        scale is compressed and not to scale.
      </p>
    </section>
  )
}
