import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { AdditiveBlending } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import {
  buildFibreCurve,
  CAMERA_PRESETS,
  getCurveMidpoint,
  getScaleMarkers,
  getSpatialPowerMarkers,
  getSpatialPulseMarkers,
  type CameraPresetId,
  type FibreRouteStyle,
} from './fibreShowcase'
import type { PowerDistanceData } from './powerDistancePlot'
import { PulseAnimationLayer } from './PulseAnimationLayer'
import {
  getPulseAnimationUnavailableReason,
  isValidPulseAnimationData,
  PULSE_MAX_VISUAL_WIDTH_RATIO,
  PULSE_VISUAL_DURATION_SECONDS,
  type PulseAnimationData,
} from './pulseAnimation'
import type { VisualizationSettings } from './visualizationSettings'

export type { PulseAnimationData } from './pulseAnimation'

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
const MIN_MODE_GRID_POINTS = 3
const MAX_MODE_GRID_POINTS = 65
const MODE_FIELD_POINT_SIZE = 0.12
const MODE_FIELD_GLOW_POINT_SIZE = 0.22
const MODE_FIELD_DISPLAY_THRESHOLD = 0.01
const MODE_FIELD_RADIUS_RING_SEGMENTS = 64
const MODE_FIELD_RADIUS_RING_THICKNESS = 0.018
const LEAKAGE_MARKER_COUNT = 7
const LEAKAGE_MARKER_BASE_SIZE = 0.055
const MODE_PROFILE_MODEL_ID = 'gaussian_lp01_mode_profile'
const MODE_PROFILE_MODEL_VERSION = '1.0.0'

function canRenderWebGL(): boolean {
  if (import.meta.env.MODE === 'test') {
    return true
  }

  if (typeof document === 'undefined') {
    return false
  }

  try {
    return document.createElement('canvas').getContext('webgl2') !== null
  } catch {
    return false
  }
}

export type RayGuidance = {
  criticalAngleDeg: number
  modelId: string
  modelVersion: string
}

export type ModeProfileData = {
  modeFieldRadiusUm: number
  gridHalfWidthUm: number
  gridPoints: number
  xUm: number[]
  yUm: number[]
  normalizedIntensity: number[][]
  modelId: string
  modelVersion: string
  normalizationConvention: 'unit_peak_field_and_intensity'
  radiusConvention: '1/e_field_radius'
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
  modeProfile: ModeProfileData | null
  pulseAnimation: PulseAnimationData | null
  attenuation?: PowerDistanceData | null
  visualizationSettings?: VisualizationSettings
  onVisualizationSettingsChange?: (settings: VisualizationSettings) => void
  showConfigurationControls?: boolean
}

export type FibreGeometrySceneProps = {
  coreRadiusUm: number | null
  sectionLengthKm?: number | null
  visualLengthModelUnits: number
  rayGuidance?: RayGuidance | null
  incidenceAngleDeg?: number
  rayViewEnabled?: boolean
  modeProfile?: ModeProfileData | null
  modeViewEnabled?: boolean
  pulseAnimation?: PulseAnimationData | null
  pulseAnimationEnabled?: boolean
  pulseAnimationPlaying?: boolean
  onPulseAnimationComplete?: () => void
  pulseAnimationResetSignal?: number
  fibreRoute?: FibreRouteStyle
  claddingVisible?: boolean
  scaleMarkersEnabled?: boolean
  powerIndicatorsEnabled?: boolean
  pulseMarkersEnabled?: boolean
  attenuation?: PowerDistanceData | null
}

type RayPoint = [number, number, number]

type RaySegmentProps = {
  name: string
  start: RayPoint
  end: RayPoint
  color?: string
  thickness?: number
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

function isValidModeProfile(
  profile: ModeProfileData | null | undefined,
): profile is ModeProfileData {
  if (
    profile === null ||
    profile === undefined ||
    !Number.isFinite(profile.modeFieldRadiusUm) ||
    profile.modeFieldRadiusUm <= 0 ||
    !Number.isFinite(profile.gridHalfWidthUm) ||
    profile.gridHalfWidthUm <= 0 ||
    !Number.isSafeInteger(profile.gridPoints) ||
    profile.gridPoints < MIN_MODE_GRID_POINTS ||
    profile.gridPoints > MAX_MODE_GRID_POINTS ||
    profile.gridPoints % 2 === 0 ||
    !Array.isArray(profile.xUm) ||
    !Array.isArray(profile.yUm) ||
    !Array.isArray(profile.normalizedIntensity) ||
    profile.xUm.length !== profile.gridPoints ||
    profile.yUm.length !== profile.gridPoints ||
    profile.normalizedIntensity.length !== profile.gridPoints ||
    profile.modelId !== MODE_PROFILE_MODEL_ID ||
    profile.modelVersion !== MODE_PROFILE_MODEL_VERSION ||
    profile.normalizationConvention !== 'unit_peak_field_and_intensity' ||
    profile.radiusConvention !== '1/e_field_radius'
  ) {
    return false
  }

  return (
    profile.xUm.every((value) => Number.isFinite(value)) &&
    profile.yUm.every((value) => Number.isFinite(value)) &&
    profile.normalizedIntensity.every(
      (row) =>
        Array.isArray(row) &&
        row.length === profile.gridPoints &&
        row.every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        ),
    )
  )
}

function hasDisplayableModeSample(profile: ModeProfileData): boolean {
  return profile.normalizedIntensity.some((row) =>
    row.some((intensity) => intensity >= MODE_FIELD_DISPLAY_THRESHOLD),
  )
}

function hasValidPhysicalCoreRadius(
  coreRadiusUm: number | null,
): coreRadiusUm is number {
  return (
    coreRadiusUm !== null && Number.isFinite(coreRadiusUm) && coreRadiusUm > 0
  )
}

type ModeFieldGeometry = {
  positions: Float32Array
  colors: Float32Array
  intensities: Float32Array
  sampleCount: number
}

function getModeFieldColor(intensity: number): [number, number, number] {
  // Heat map for normalized intensity: deep indigo → cyan → amber → white.
  const t = clamp(intensity, 0, 1)

  if (t < 0.33) {
    const local = t / 0.33
    return [0.08 + local * 0.12, 0.12 + local * 0.55, 0.45 + local * 0.45]
  }

  if (t < 0.66) {
    const local = (t - 0.33) / 0.33
    return [0.2 + local * 0.75, 0.67 + local * 0.25, 0.9 - local * 0.55]
  }

  const local = (t - 0.66) / 0.34
  return [0.95 + local * 0.05, 0.92 + local * 0.08, 0.35 + local * 0.65]
}

function getLeakageMarkerColor(
  progress: number,
): [number, number, number] {
  const fade = 1 - progress
  return [0.98, 0.35 + fade * 0.25, 0.18 + fade * 0.12]
}

function getModeFieldGeometry(
  profile: ModeProfileData | null | undefined,
  coreRadiusUm: number | null,
): ModeFieldGeometry | null {
  if (
    !isValidModeProfile(profile) ||
    !hasValidPhysicalCoreRadius(coreRadiusUm)
  ) {
    return null
  }

  const normalizedCoreRadius = getNormalisedCoreRadius(coreRadiusUm)
  const coordinateScale = normalizedCoreRadius / coreRadiusUm
  const maximumSampleCount = profile.gridPoints * profile.gridPoints
  const positions = new Float32Array(maximumSampleCount * 3)
  const colors = new Float32Array(maximumSampleCount * 3)
  const intensities = new Float32Array(maximumSampleCount)
  let sampleIndex = 0

  for (let rowIndex = 0; rowIndex < profile.gridPoints; rowIndex += 1) {
    const y = profile.yUm[rowIndex]
    const intensityRow = profile.normalizedIntensity[rowIndex]

    for (
      let columnIndex = 0;
      columnIndex < profile.gridPoints;
      columnIndex += 1
    ) {
      const intensity = intensityRow[columnIndex]

      if (intensity < MODE_FIELD_DISPLAY_THRESHOLD) {
        continue
      }

      const positionOffset = sampleIndex * 3
      const [red, green, blue] = getModeFieldColor(intensity)

      positions[positionOffset] = 0
      positions[positionOffset + 1] = profile.xUm[columnIndex] * coordinateScale
      positions[positionOffset + 2] = y * coordinateScale
      colors[positionOffset] = red
      colors[positionOffset + 1] = green
      colors[positionOffset + 2] = blue
      intensities[sampleIndex] = intensity
      sampleIndex += 1
    }
  }

  if (sampleIndex === 0) {
    return null
  }

  return {
    positions: positions.slice(0, sampleIndex * 3),
    colors: colors.slice(0, sampleIndex * 3),
    intensities: intensities.slice(0, sampleIndex),
    sampleCount: sampleIndex,
  }
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

function RaySegment({
  name,
  start,
  end,
  color = '#ffe066',
  thickness = RAY_THICKNESS,
}: RaySegmentProps) {
  const { length, position, rotation } = getSegmentGeometry(start, end)

  return (
    <mesh name={name} position={position} rotation={rotation}>
      <boxGeometry
        name={`${name}-geometry`}
        args={[length, thickness, thickness]}
      />
      <meshBasicMaterial
        name="educational-ray-material"
        color={color}
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
  const exitPoint: RayPoint = [
    visualLength / 2 - 0.25,
    CLADDING_RADIUS * 0.72,
    0,
  ]
  const leakageMarkers: ReactNode[] = []

  for (let index = 0; index < LEAKAGE_MARKER_COUNT; index += 1) {
    const progress = index / (LEAKAGE_MARKER_COUNT - 1)
    const markerX =
      boundaryPoint[0] + (exitPoint[0] - boundaryPoint[0]) * progress
    const markerY =
      boundaryPoint[1] + (exitPoint[1] - boundaryPoint[1]) * progress
    const flare = progress * 0.14
    const [red, green, blue] = getLeakageMarkerColor(progress)
    const size = LEAKAGE_MARKER_BASE_SIZE * (1.35 - progress * 0.55)

    leakageMarkers.push(
      <mesh
        key={`leak-${index}`}
        name={`educational-ray-leakage-marker-${index}`}
        position={[markerX, markerY + flare * (index % 2 === 0 ? 1 : -0.35), 0]}
      >
        <sphereGeometry
          name={`educational-ray-leakage-marker-${index}-geometry`}
          args={[size, 16, 16]}
        />
        <meshBasicMaterial
          name={`educational-ray-leakage-marker-${index}-material`}
          color={`rgb(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)})`}
          transparent
          opacity={0.95 - progress * 0.45}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>,
    )
  }

  return (
    <group name="educational-ray-transmission">
      <RaySegment
        name="educational-ray-transmission-incident-segment"
        start={[-visualLength / 2 + 0.25, -coreRadius * 0.55, 0]}
        end={boundaryPoint}
        color="#ffd166"
      />
      <mesh name="educational-ray-leakage-point" position={boundaryPoint}>
        <sphereGeometry
          name="educational-ray-leakage-point-geometry"
          args={[0.09, 20, 20]}
        />
        <meshBasicMaterial
          name="educational-ray-leakage-point-material"
          color="#ff6b4a"
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        name="educational-ray-leakage-glow"
        position={boundaryPoint}
      >
        <sphereGeometry
          name="educational-ray-leakage-glow-geometry"
          args={[0.16, 20, 20]}
        />
        <meshBasicMaterial
          name="educational-ray-leakage-glow-material"
          color="#ff8f70"
          transparent
          opacity={0.35}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <RaySegment
        name="educational-ray-transmission-exiting-segment"
        start={boundaryPoint}
        end={exitPoint}
        color="#ff7a59"
        thickness={RAY_THICKNESS * 0.85}
      />
      <group name="educational-ray-leakage-markers">{leakageMarkers}</group>
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

function ApproximateLP01FieldLayer({
  geometry,
  modeFieldRadiusUm,
  coreRadiusUm,
}: {
  geometry: ModeFieldGeometry
  modeFieldRadiusUm: number
  coreRadiusUm: number
}) {
  const ringRadius =
    (modeFieldRadiusUm / coreRadiusUm) * getNormalisedCoreRadius(coreRadiusUm)

  return (
    <group name="approximate-lp01-field-layer">
      <mesh
        name="approximate-lp01-field-backdrop"
        rotation={[0, HALF_TURN, 0]}
      >
        <circleGeometry
          name="approximate-lp01-field-backdrop-geometry"
          args={[CLADDING_RADIUS * 0.98, 64]}
        />
        <meshBasicMaterial
          name="approximate-lp01-field-backdrop-material"
          color="#0b1220"
          transparent
          opacity={0.55}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        name="approximate-lp01-field-radius-ring"
        rotation={[0, HALF_TURN, 0]}
      >
        <torusGeometry
          name="approximate-lp01-field-radius-ring-geometry"
          args={[
            ringRadius,
            MODE_FIELD_RADIUS_RING_THICKNESS,
            12,
            MODE_FIELD_RADIUS_RING_SEGMENTS,
          ]}
        />
        <meshBasicMaterial
          name="approximate-lp01-field-radius-ring-material"
          color="#f8fafc"
          transparent
          opacity={0.85}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <points name="approximate-lp01-field-glow">
        <bufferGeometry name="approximate-lp01-field-glow-geometry">
          <bufferAttribute
            attach="attributes-position"
            name="approximate-lp01-field-glow-position-attribute"
            args={[geometry.positions, 3]}
            array={geometry.positions}
            count={geometry.sampleCount}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            name="approximate-lp01-field-glow-color-attribute"
            args={[geometry.colors, 3]}
            array={geometry.colors}
            count={geometry.sampleCount}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          name="approximate-lp01-field-glow-material"
          size={MODE_FIELD_GLOW_POINT_SIZE}
          vertexColors
          transparent
          opacity={0.28}
          depthWrite={false}
          depthTest={false}
          sizeAttenuation
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </points>
      <points name="approximate-lp01-field">
        <bufferGeometry name="approximate-lp01-field-geometry">
          <bufferAttribute
            attach="attributes-position"
            name="approximate-lp01-field-position-attribute"
            args={[geometry.positions, 3]}
            array={geometry.positions}
            count={geometry.sampleCount}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            name="approximate-lp01-field-color-attribute"
            args={[geometry.colors, 3]}
            array={geometry.colors}
            count={geometry.sampleCount}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-intensity"
            name="approximate-lp01-field-intensity-attribute"
            args={[geometry.intensities, 1]}
            array={geometry.intensities}
            count={geometry.sampleCount}
            itemSize={1}
          />
        </bufferGeometry>
        <pointsMaterial
          name="approximate-lp01-field-material"
          size={MODE_FIELD_POINT_SIZE}
          vertexColors
          transparent
          opacity={0.96}
          depthWrite={false}
          depthTest={false}
          sizeAttenuation
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </points>
    </group>
  )
}

type ModeProfilePanelProps = {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  modeProfile: ModeProfileData | null
  coreRadiusUm: number | null
  showToggle: boolean
}

function ModeProfilePanel({
  enabled,
  onEnabledChange,
  modeProfile,
  coreRadiusUm,
  showToggle,
}: ModeProfilePanelProps) {
  const validProfile = isValidModeProfile(modeProfile)
  const available =
    validProfile &&
    hasValidPhysicalCoreRadius(coreRadiusUm) &&
    hasDisplayableModeSample(modeProfile)

  return (
    <>
      {showToggle && (
        <div className="geometry-layer-control">
          <label htmlFor="approximate-lp01-field-view">
            <input
              id="approximate-lp01-field-view"
              type="checkbox"
              checked={enabled}
              aria-describedby={
                enabled ? 'mode-profile-explanation' : undefined
              }
              onChange={(event) => onEnabledChange(event.currentTarget.checked)}
            />
            Approximate LP01 field
          </label>
        </div>
      )}

      {enabled && (
        <>
          {!available && (
            <p className="mode-profile-status" role="status">
              Approximate LP01 field unavailable: valid backend normalized
              intensity samples at or above the display threshold and a positive
              entered core radius are required to place this transverse slice.
            </p>
          )}

          {available && (
            <dl className="mode-facts">
              <div>
                <dt>Mode-field radius</dt>
                <dd>{modeProfile.modeFieldRadiusUm} µm</dd>
              </div>
              <div>
                <dt>Grid half-width</dt>
                <dd>±{modeProfile.gridHalfWidthUm} µm</dd>
              </div>
              <div>
                <dt>Grid dimensions / backend samples</dt>
                <dd>
                  {modeProfile.gridPoints} × {modeProfile.gridPoints} (
                  {modeProfile.gridPoints * modeProfile.gridPoints} samples)
                </dd>
              </div>
              <div>
                <dt>Normalized intensity (dimensionless)</dt>
                <dd>0–1</dd>
              </div>
              <div>
                <dt>Display threshold</dt>
                <dd>≥ {MODE_FIELD_DISPLAY_THRESHOLD} normalized intensity</dd>
              </div>
              <div>
                <dt>1/e field-radius ring</dt>
                <dd>White torus at supplied mode-field radius</dd>
              </div>
              <div>
                <dt>Approximate model</dt>
                <dd className="mode-profile-model">
                  {modeProfile.modelId} ({modeProfile.modelVersion})
                </dd>
              </div>
              <div>
                <dt>Normalization</dt>
                <dd className="mode-profile-model">
                  {modeProfile.normalizationConvention}
                </dd>
              </div>
              <div>
                <dt>Radius convention</dt>
                <dd className="mode-profile-model">
                  {modeProfile.radiusConvention}
                </dd>
              </div>
            </dl>
          )}

          <p id="mode-profile-explanation" className="mode-profile-explanation">
            This is a scalar, circularly symmetric Gaussian LP01 approximation
            reconstructed from backend normalized-intensity samples (related to
            |E|²). Intensity uses a heat colormap with additive glow; the white
            ring marks the supplied 1/e field radius (1/e² intensity radius).
            Samples below 0.01, or 1% of unit peak, are omitted from the display
            for clarity without changing the backend grid or reported values.
            This field layer is separate from the educational ray and is not a
            physical ray path. It is not an exact step-index eigenmode or a
            full-wave electromagnetic solution.
          </p>
        </>
      )}
    </>
  )
}

type PulseAnimationPanelProps = {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  pulseAnimation: PulseAnimationData | null
  sectionLengthKm: number | null
  isPlaying: boolean
  started: boolean
  completed: boolean
  onPlayPause: () => void
  onReset: () => void
  showToggle: boolean
}

type PulseAnimationPlaybackState = {
  data: PulseAnimationData | null
  isPlaying: boolean
  started: boolean
  completed: boolean
  resetSignal: number
}

function PulseAnimationPanel({
  enabled,
  onEnabledChange,
  pulseAnimation,
  sectionLengthKm,
  isPlaying,
  started,
  completed,
  onPlayPause,
  onReset,
  showToggle,
}: PulseAnimationPanelProps) {
  const validPulseData = isValidPulseAnimationData(pulseAnimation)
  const validSectionLength =
    sectionLengthKm !== null &&
    Number.isFinite(sectionLengthKm) &&
    sectionLengthKm > 0
  const matchingSectionLength =
    validPulseData &&
    validSectionLength &&
    pulseAnimation.sectionLengthKm === sectionLengthKm
  const available = validPulseData && matchingSectionLength
  const unavailableReason = !validPulseData
    ? getPulseAnimationUnavailableReason(pulseAnimation)
    : !validSectionLength
      ? 'a finite positive physical section length is required'
      : 'the animation and current form section lengths must match'
  const statusText = !available
    ? 'Unavailable and not moving.'
    : isPlaying
      ? 'Playing: visual transit in progress.'
      : completed
        ? 'Paused at output.'
        : started
          ? 'Paused in transit.'
          : 'Paused at entrance.'

  return (
    <>
      {showToggle && (
        <div className="geometry-layer-control">
          <label htmlFor="scaled-pulse-animation-view">
            <input
              id="scaled-pulse-animation-view"
              type="checkbox"
              checked={enabled}
              aria-describedby={
                enabled ? 'pulse-animation-explanation' : undefined
              }
              onChange={(event) => onEnabledChange(event.currentTarget.checked)}
            />
            Scaled pulse animation
          </label>
        </div>
      )}

      {enabled && (
        <>
          {!available && (
            <p
              className="pulse-animation-status"
              data-state="unavailable"
              role="status"
            >
              Scaled pulse animation unavailable: {unavailableReason}. No pulse
              geometry is rendered and it is not moving.
            </p>
          )}

          {available && (
            <>
              <div className="pulse-animation-controls">
                <button
                  className="pulse-animation-button"
                  type="button"
                  disabled={!available}
                  onClick={onPlayPause}
                >
                  {isPlaying ? 'Pause' : completed ? 'Restart' : 'Play'}
                </button>
                <button
                  className="pulse-animation-button"
                  type="button"
                  disabled={!available}
                  onClick={onReset}
                >
                  Reset/Restart
                </button>
              </div>

              <p
                className="pulse-animation-status"
                data-state={
                  isPlaying
                    ? 'playing'
                    : completed
                      ? 'output'
                      : started
                        ? 'paused'
                        : 'entrance'
                }
                role="status"
                aria-live="polite"
              >
                {statusText}
              </p>

              <dl className="pulse-facts">
                <div>
                  <dt>Input FWHM</dt>
                  <dd>{pulseAnimation.inputPulseFwhmPs} ps</dd>
                </div>
                <div>
                  <dt>Output FWHM</dt>
                  <dd>{pulseAnimation.outputPulseFwhmPs} ps</dd>
                </div>
                <div>
                  <dt>Dispersion broadening FWHM</dt>
                  <dd>{pulseAnimation.dispersionBroadeningFwhmPs} ps</dd>
                </div>
                <div>
                  <dt>Physical section length</dt>
                  <dd>{pulseAnimation.sectionLengthKm} km</dd>
                </div>
                <div>
                  <dt>Physical group delay</dt>
                  <dd>{pulseAnimation.groupDelayPs} ps</dd>
                </div>
                <div>
                  <dt>Visual transit duration</dt>
                  <dd>{PULSE_VISUAL_DURATION_SECONDS} s</dd>
                </div>
                <div>
                  <dt>Approximate model</dt>
                  <dd className="pulse-animation-model">
                    {pulseAnimation.modelId} ({pulseAnimation.modelVersion})
                  </dd>
                </div>
                <div>
                  <dt>Delay model id/version</dt>
                  <dd className="pulse-animation-model">
                    {pulseAnimation.delayModelId} (
                    {pulseAnimation.delayModelVersion})
                  </dd>
                </div>
                <div>
                  <dt>FWHM convention</dt>
                  <dd>{pulseAnimation.widthConvention}</dd>
                </div>
              </dl>
            </>
          )}

          <p
            id="pulse-animation-explanation"
            className="pulse-animation-explanation"
          >
            <strong>Animation time is scaled</strong>. Playback is one-shot and
            starts paused. The visual transit duration, position, and
            longitudinal envelope width are scaled/normalized for this
            schematic. Temporal FWHM is not a physical spatial pulse length. The
            envelope width between the exact backend input and output endpoints
            is a visual-only interpolation, not a physics-derived intermediate
            pulse-width series. The visual width ratio is capped at{' '}
            {PULSE_MAX_VISUAL_WIDTH_RATIO}× for readability. Brightness and
            color do not encode power or attenuation. No chirp, higher-order
            dispersion, nonlinear effects, or full-wave propagation is shown.
          </p>
        </>
      )}
    </>
  )
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

  return `Leakage into cladding: ${incidence} is below the ${critical} critical angle. Markers show the schematic leakage path leaving the core.`
}

type RayGuidancePanelProps = {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  incidenceAngleDeg: number
  onIncidenceAngleChange: (angle: number) => void
  guidance: RayGuidance | null
  showControls: boolean
}

function RayGuidancePanel({
  enabled,
  onEnabledChange,
  incidenceAngleDeg,
  onIncidenceAngleChange,
  guidance,
  showControls,
}: RayGuidancePanelProps) {
  const status = getRayStatus(incidenceAngleDeg, guidance)
  const validGuidance = isValidRayGuidance(guidance)
  const statusText = getRayStatusText(status, incidenceAngleDeg, guidance)

  return (
    <>
      {showControls && (
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
      )}

      {enabled && (
        <>
          {showControls && (
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
          )}

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
            angle. Below it, the educational ray shows leakage into the
            cladding with an orange exit path and leakage markers. Status comes
            from the backend critical angle. The ray path is schematic, not
            longitudinally or radially to scale, and is not a full-wave field
            solution.
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

function CameraPresetController({
  preset,
}: {
  preset: CameraPresetId
}) {
  const { camera, invalidate } = useThree()

  useEffect(() => {
    const next = CAMERA_PRESETS[preset]
    camera.position.set(...next.position)
    camera.lookAt(...next.target)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, invalidate, preset])

  return null
}

function StraightFibreBody({
  coreRadius,
  visualLength,
  claddingVisible,
  coreMaterialProps,
}: {
  coreRadius: number
  visualLength: number
  claddingVisible: boolean
  coreMaterialProps: {
    transparent?: boolean
    opacity?: number
    depthWrite?: boolean
  }
}) {
  return (
    <group rotation={[0, 0, HALF_TURN]}>
      <mesh name="solid-fibre-core">
        <cylinderGeometry
          name="solid-core-geometry"
          args={[coreRadius, coreRadius, visualLength, CYLINDER_SEGMENTS]}
        />
        <meshStandardMaterial
          {...coreMaterialProps}
          name="solid-core-material"
          color="#f2a65a"
          emissive="#3a1d0a"
          emissiveIntensity={0.12}
          roughness={0.28}
          metalness={0.08}
        />
      </mesh>
      {claddingVisible && (
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
          <meshPhysicalMaterial
            name="illustrative-cladding-material"
            color="#6eb6ff"
            transparent
            opacity={0.24}
            depthWrite={false}
            roughness={0.18}
            metalness={0.02}
            transmission={0.35}
            thickness={0.4}
          />
        </mesh>
      )}
    </group>
  )
}

function CurvedFibreBody({
  coreRadius,
  visualLength,
  fibreRoute,
  claddingVisible,
  coreMaterialProps,
}: {
  coreRadius: number
  visualLength: number
  fibreRoute: FibreRouteStyle
  claddingVisible: boolean
  coreMaterialProps: {
    transparent?: boolean
    opacity?: number
    depthWrite?: boolean
  }
}) {
  const curve = buildFibreCurve(fibreRoute, visualLength)

  return (
    <group name="curved-fibre-body">
      <mesh name="solid-fibre-core">
        <tubeGeometry
          name="solid-core-geometry"
          args={[curve, 96, coreRadius, 24, false]}
        />
        <meshStandardMaterial
          {...coreMaterialProps}
          name="solid-core-material"
          color="#f2a65a"
          emissive="#3a1d0a"
          emissiveIntensity={0.12}
          roughness={0.28}
          metalness={0.08}
        />
      </mesh>
      {claddingVisible && (
        <mesh name="illustrative-cladding-shell">
          <tubeGeometry
            name="illustrative-cladding-geometry"
            args={[curve, 96, CLADDING_RADIUS, 24, false]}
          />
          <meshPhysicalMaterial
            name="illustrative-cladding-material"
            color="#6eb6ff"
            transparent
            opacity={0.24}
            depthWrite={false}
            roughness={0.18}
            metalness={0.02}
            transmission={0.35}
            thickness={0.4}
          />
        </mesh>
      )}
    </group>
  )
}

function ScaleMarkerLayer({
  markers,
}: {
  markers: ReturnType<typeof getScaleMarkers>
}) {
  return (
    <group name="scale-marker-layer">
      {markers.map((marker, index) => (
        <group
          key={`scale-${index}`}
          name={`scale-marker-${index}`}
          position={marker.position}
        >
          <mesh name={`scale-marker-${index}-tick`}>
            <boxGeometry args={[0.04, CLADDING_RADIUS * 1.55, 0.04]} />
            <meshBasicMaterial
              color="#e2e8f0"
              transparent
              opacity={0.85}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            name={`scale-marker-${index}-bead`}
            position={[0, CLADDING_RADIUS * 0.95, 0]}
          >
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshBasicMaterial
              color="#f8fafc"
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function SpatialPowerLayer({
  markers,
}: {
  markers: ReturnType<typeof getSpatialPowerMarkers>
}) {
  return (
    <group name="spatial-power-layer">
      {markers.map((marker, index) => (
        <mesh
          key={`power-${index}`}
          name={`spatial-power-marker-${index}`}
          position={marker.position}
        >
          <sphereGeometry
            name={`spatial-power-marker-${index}-geometry`}
            args={[marker.radius, 18, 18]}
          />
          <meshBasicMaterial
            name={`spatial-power-marker-${index}-material`}
            color={marker.color}
            transparent
            opacity={0.78}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

function SpatialPulseMarkerLayer({
  markers,
}: {
  markers: ReturnType<typeof getSpatialPulseMarkers>
}) {
  return (
    <group name="spatial-pulse-marker-layer">
      {markers.map((marker) => (
        <mesh
          key={marker.id}
          name={`spatial-pulse-marker-${marker.id}`}
          position={marker.position}
        >
          <sphereGeometry
            name={`spatial-pulse-marker-${marker.id}-geometry`}
            args={[marker.radius, 20, 20]}
          />
          <meshBasicMaterial
            name={`spatial-pulse-marker-${marker.id}-material`}
            color={marker.color}
            transparent
            opacity={0.72}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

export function FibreGeometryScene({
  coreRadiusUm,
  sectionLengthKm = null,
  visualLengthModelUnits,
  rayGuidance = null,
  incidenceAngleDeg = DEFAULT_INCIDENCE_ANGLE_DEG,
  rayViewEnabled = false,
  modeProfile = null,
  modeViewEnabled = true,
  pulseAnimation = null,
  pulseAnimationEnabled = true,
  pulseAnimationPlaying = false,
  onPulseAnimationComplete = () => {},
  pulseAnimationResetSignal = 0,
  fibreRoute = 'straight',
  claddingVisible = true,
  scaleMarkersEnabled = false,
  powerIndicatorsEnabled = false,
  pulseMarkersEnabled = false,
  attenuation = null,
}: FibreGeometrySceneProps) {
  const coreRadius = getNormalisedCoreRadius(coreRadiusUm)
  const visualLength = getVisualLength(visualLengthModelUnits)
  const modeFieldGeometry = modeViewEnabled
    ? getModeFieldGeometry(modeProfile, coreRadiusUm)
    : null
  const pulseAnimationData =
    pulseAnimationEnabled && isValidPulseAnimationData(pulseAnimation)
      ? pulseAnimation
      : null
  const hasOverlay =
    rayViewEnabled ||
    modeFieldGeometry !== null ||
    pulseAnimationData !== null
  const coreMaterialProps = hasOverlay
    ? { transparent: true, opacity: 0.42, depthWrite: false }
    : {}
  const overlayOrigin =
    fibreRoute === 'straight'
      ? ([0, 0, 0] as [number, number, number])
      : getCurveMidpoint(fibreRoute, visualLength)
  const scaleMarkers = scaleMarkersEnabled
    ? getScaleMarkers(fibreRoute, visualLength, sectionLengthKm)
    : []
  const powerMarkers =
    powerIndicatorsEnabled
      ? getSpatialPowerMarkers(fibreRoute, visualLength, attenuation)
      : []
  const pulseMarkers =
    pulseMarkersEnabled
      ? getSpatialPulseMarkers(fibreRoute, visualLength, pulseAnimationData)
      : []

  return (
    <group name="fibre-geometry-scene">
      {fibreRoute === 'straight' ? (
        <StraightFibreBody
          coreRadius={coreRadius}
          visualLength={visualLength}
          claddingVisible={claddingVisible}
          coreMaterialProps={coreMaterialProps}
        />
      ) : (
        <CurvedFibreBody
          coreRadius={coreRadius}
          visualLength={visualLength}
          fibreRoute={fibreRoute}
          claddingVisible={claddingVisible}
          coreMaterialProps={coreMaterialProps}
        />
      )}
      {scaleMarkers.length > 0 && <ScaleMarkerLayer markers={scaleMarkers} />}
      {powerMarkers.length > 0 && <SpatialPowerLayer markers={powerMarkers} />}
      {pulseMarkers.length > 0 && (
        <SpatialPulseMarkerLayer markers={pulseMarkers} />
      )}
      <group name="schematic-overlay-frame" position={overlayOrigin}>
        {rayViewEnabled && (
          <EducationalRayLayer
            coreRadius={coreRadius}
            visualLength={visualLength}
            incidenceAngleDeg={incidenceAngleDeg}
            guidance={rayGuidance}
          />
        )}
        {modeFieldGeometry !== null &&
          isValidModeProfile(modeProfile) &&
          hasValidPhysicalCoreRadius(coreRadiusUm) && (
            <ApproximateLP01FieldLayer
              geometry={modeFieldGeometry}
              modeFieldRadiusUm={modeProfile.modeFieldRadiusUm}
              coreRadiusUm={coreRadiusUm}
            />
          )}
        {pulseAnimationData !== null && (
          <PulseAnimationLayer
            key={pulseAnimationResetSignal}
            data={pulseAnimationData}
            visualLength={visualLength}
            isPlaying={pulseAnimationPlaying}
            onComplete={onPulseAnimationComplete}
          />
        )}
      </group>
    </group>
  )
}

export function FibreGeometryView({
  coreRadiusUm,
  sectionLengthKm,
  rayGuidance,
  modeProfile,
  pulseAnimation,
  attenuation = null,
  visualizationSettings,
  onVisualizationSettingsChange,
  showConfigurationControls = true,
}: FibreGeometryViewProps) {
  const [localVisualLength, setLocalVisualLength] = useState(
    DEFAULT_VISUAL_LENGTH,
  )
  const [localRayViewEnabled, setLocalRayViewEnabled] = useState(true)
  const [localModeViewEnabled, setLocalModeViewEnabled] = useState(true)
  const [localPulseAnimationEnabled, setLocalPulseAnimationEnabled] =
    useState(true)
  const [pulseAnimationPlayback, setPulseAnimationPlayback] =
    useState<PulseAnimationPlaybackState>({
      data: pulseAnimation,
      isPlaying: false,
      started: false,
      completed: false,
      resetSignal: 0,
    })
  const [localIncidenceAngleDeg, setLocalIncidenceAngleDeg] = useState(
    DEFAULT_INCIDENCE_ANGLE_DEG,
  )
  const [webglAvailable] = useState(canRenderWebGL)
  const visualLength = visualizationSettings?.visualLength ?? localVisualLength
  const rayViewEnabled =
    visualizationSettings?.rayViewEnabled ?? localRayViewEnabled
  const modeViewEnabled =
    visualizationSettings?.modeViewEnabled ?? localModeViewEnabled
  const pulseAnimationEnabled =
    visualizationSettings?.pulseAnimationEnabled ?? localPulseAnimationEnabled
  const incidenceAngleDeg =
    visualizationSettings?.incidenceAngleDeg ?? localIncidenceAngleDeg
  const fibreRoute = visualizationSettings?.fibreRoute ?? 'straight'
  const cameraPreset = visualizationSettings?.cameraPreset ?? 'perspective'
  const claddingVisible = visualizationSettings?.claddingVisible ?? true
  const scaleMarkersEnabled =
    visualizationSettings?.scaleMarkersEnabled ?? true
  const powerIndicatorsEnabled =
    visualizationSettings?.powerIndicatorsEnabled ?? true
  const pulseMarkersEnabled =
    visualizationSettings?.pulseMarkersEnabled ?? true
  const updateVisualizationSetting = useCallback(
    <Key extends keyof VisualizationSettings>(
      key: Key,
      value: VisualizationSettings[Key],
    ) => {
      if (visualizationSettings !== undefined) {
        onVisualizationSettingsChange?.({
          ...visualizationSettings,
          [key]: value,
        })
        return
      }

      if (key === 'visualLength') {
        setLocalVisualLength(value as number)
      } else if (key === 'rayViewEnabled') {
        setLocalRayViewEnabled(value as boolean)
      } else if (key === 'modeViewEnabled') {
        setLocalModeViewEnabled(value as boolean)
      } else if (key === 'pulseAnimationEnabled') {
        setLocalPulseAnimationEnabled(value as boolean)
      } else if (key === 'incidenceAngleDeg') {
        setLocalIncidenceAngleDeg(value as number)
      }
    },
    [onVisualizationSettingsChange, visualizationSettings],
  )
  const validPulseAnimationData = isValidPulseAnimationData(pulseAnimation)
  const validSectionLength =
    sectionLengthKm !== null &&
    Number.isFinite(sectionLengthKm) &&
    sectionLengthKm > 0
  const matchingPulseSectionLength =
    validPulseAnimationData &&
    validSectionLength &&
    pulseAnimation.sectionLengthKm === sectionLengthKm
  const pulseAnimationForScene =
    validPulseAnimationData && matchingPulseSectionLength
      ? pulseAnimation
      : null
  const pulseAnimationAvailable = pulseAnimationForScene !== null
  const currentPulseAnimationPlayback = useMemo(
    () =>
      pulseAnimationPlayback.data === pulseAnimation
        ? pulseAnimationPlayback
        : {
            data: pulseAnimation,
            isPlaying: false,
            started: false,
            completed: false,
            resetSignal: pulseAnimationPlayback.resetSignal + 1,
          },
    [pulseAnimation, pulseAnimationPlayback],
  )

  const handlePulseAnimationComplete = useCallback(() => {
    setPulseAnimationPlayback({
      data: pulseAnimation,
      isPlaying: false,
      started: true,
      completed: true,
      resetSignal: currentPulseAnimationPlayback.resetSignal,
    })
  }, [currentPulseAnimationPlayback.resetSignal, pulseAnimation])

  const handlePulseAnimationPlayPause = useCallback(() => {
    if (!pulseAnimationAvailable) {
      return
    }

    setPulseAnimationPlayback({
      ...currentPulseAnimationPlayback,
      data: pulseAnimation,
      isPlaying: !currentPulseAnimationPlayback.isPlaying,
      started: true,
      completed: false,
      resetSignal:
        currentPulseAnimationPlayback.resetSignal +
        (currentPulseAnimationPlayback.completed ? 1 : 0),
    })
  }, [currentPulseAnimationPlayback, pulseAnimation, pulseAnimationAvailable])

  const handlePulseAnimationReset = useCallback(() => {
    setPulseAnimationPlayback({
      data: pulseAnimation,
      isPlaying: false,
      started: false,
      completed: false,
      resetSignal: currentPulseAnimationPlayback.resetSignal + 1,
    })
  }, [currentPulseAnimationPlayback.resetSignal, pulseAnimation])

  const handlePulseAnimationEnabledChange = useCallback(
    (enabled: boolean) => {
      updateVisualizationSetting('pulseAnimationEnabled', enabled)
      setPulseAnimationPlayback({
        data: pulseAnimation,
        isPlaying: false,
        started: false,
        completed: false,
        resetSignal: currentPulseAnimationPlayback.resetSignal + 1,
      })
    },
    [
      currentPulseAnimationPlayback.resetSignal,
      pulseAnimation,
      updateVisualizationSetting,
    ],
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
        {webglAvailable ? (
          <Canvas
            role="img"
            aria-label="Illustrative interactive 3D fibre geometry"
            aria-describedby="geometry-scale-note showcase-legend"
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
            <color attach="background" args={['#0b1220']} />
            <ambientLight intensity={0.55} />
            <directionalLight position={[6, 9, 5]} intensity={1.55} />
            <directionalLight position={[-4, 2, -6]} intensity={0.45} />
            <pointLight position={[0, 4, 3]} intensity={0.55} color="#9ecbff" />
            <FibreGeometryScene
              coreRadiusUm={coreRadiusUm}
              sectionLengthKm={sectionLengthKm}
              visualLengthModelUnits={visualLength}
              rayGuidance={rayGuidance}
              incidenceAngleDeg={incidenceAngleDeg}
              rayViewEnabled={rayViewEnabled}
              modeProfile={modeProfile}
              modeViewEnabled={modeViewEnabled}
              pulseAnimation={pulseAnimationForScene}
              pulseAnimationEnabled={pulseAnimationEnabled}
              pulseAnimationPlaying={currentPulseAnimationPlayback.isPlaying}
              onPulseAnimationComplete={handlePulseAnimationComplete}
              pulseAnimationResetSignal={
                currentPulseAnimationPlayback.resetSignal
              }
              fibreRoute={fibreRoute}
              claddingVisible={claddingVisible}
              scaleMarkersEnabled={scaleMarkersEnabled}
              powerIndicatorsEnabled={powerIndicatorsEnabled}
              pulseMarkersEnabled={pulseMarkersEnabled}
              attenuation={attenuation}
            />
            <CameraPresetController preset={cameraPreset} />
            <FibreOrbitControls />
          </Canvas>
        ) : (
          <p className="geometry-webgl-fallback" role="status">
            3D rendering is unavailable in this browser or device.
          </p>
        )}
      </div>

      <aside id="showcase-legend" className="showcase-legend" aria-label="3D showcase legend">
        <p>
          Route: <strong>{fibreRoute}</strong> · Camera:{' '}
          <strong>{cameraPreset}</strong>
        </p>
        <ul>
          {scaleMarkersEnabled && (
            <li>White ticks map schematic path fraction to entered section length.</li>
          )}
          {powerIndicatorsEnabled && (
            <li>
              Coloured beads show backend power samples along the path (brighter /
              larger ≈ higher dBm).
            </li>
          )}
          {pulseMarkersEnabled && (
            <li>
              Cyan / amber spheres mark input and output pulse FWHM at the path
              ends.
            </li>
          )}
          <li>
            Educational ray, LP01 field, and pulse animation stay as mid-path
            schematic overlays.
          </li>
        </ul>
      </aside>

      {showConfigurationControls && (
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
              updateVisualizationSetting(
                'visualLength',
                Number(event.currentTarget.value),
              )
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
      )}

      <RayGuidancePanel
        enabled={rayViewEnabled}
        onEnabledChange={(enabled) =>
          updateVisualizationSetting('rayViewEnabled', enabled)
        }
        incidenceAngleDeg={incidenceAngleDeg}
        onIncidenceAngleChange={(angle) =>
          updateVisualizationSetting('incidenceAngleDeg', angle)
        }
        guidance={rayGuidance}
        showControls={showConfigurationControls}
      />

      <ModeProfilePanel
        enabled={modeViewEnabled}
        onEnabledChange={(enabled) =>
          updateVisualizationSetting('modeViewEnabled', enabled)
        }
        modeProfile={modeProfile}
        coreRadiusUm={coreRadiusUm}
        showToggle={showConfigurationControls}
      />

      <PulseAnimationPanel
        enabled={pulseAnimationEnabled}
        onEnabledChange={handlePulseAnimationEnabledChange}
        pulseAnimation={pulseAnimation}
        sectionLengthKm={sectionLengthKm}
        isPlaying={currentPulseAnimationPlayback.isPlaying}
        started={currentPulseAnimationPlayback.started}
        completed={currentPulseAnimationPlayback.completed}
        onPlayPause={handlePulseAnimationPlayPause}
        onReset={handlePulseAnimationReset}
        showToggle={showConfigurationControls}
      />

      <p id="geometry-scale-note" className="geometry-note">
        Radial dimensions are normalized for visibility. The cladding shell is
        illustrative because no cladding diameter is configured. Longitudinal
        scale is compressed and not to scale. Curved routes are display-only
        path styles; they do not change Level 1 physics.
      </p>
    </section>
  )
}
