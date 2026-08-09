import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { AdditiveBlending, Curve, DoubleSide, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import type { MacrobendInput } from './Level1Form'
import {
  buildCriticalRayPath,
  buildReflectedRayPath,
  buildTransmittedRayPath,
  getEducationalRayTubeGeometry,
  type EducationalRayPoint,
} from './educationalRayPath'
import {
  buildFibrePath,
  CAMERA_PRESETS,
  CAMERA_PRESET_OPTIONS,
  FIBRE_ROUTE_OPTIONS,
  getLongitudinalSegmentTransform,
  getScaleMarkers,
  getSpatialBendMarkers,
  getSpatialPowerMarkers,
  getSpatialPulseMarkers,
  type CameraPresetId,
  type FibrePath,
  type FibreRouteStyle,
  type SpatialBendMarker,
} from './fibreShowcase'
import type { MacrobendLossResult } from './macrobend'
import {
  getLP01PathFieldGeometry,
  getScalarLPPathFieldGeometry,
  LP01_PATH_SAMPLE_COUNT,
  type LP01PathFieldGeometry,
  type ScalarLPPathFieldGeometry,
} from './lp01FieldPath'
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
import {
  isScalarLPModeCatalog,
  type ScalarLPModeCatalog,
  type ScalarLPModeFamily,
  type ScalarModeFieldData,
} from './scalarMode'
import {
  useScalarModeField,
  type ScalarModeFieldState,
} from './useScalarModeField'

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
const MIN_RAY_SLOPE = 0.18
const MAX_RAY_SLOPE = 0.85
const DEGREES_TO_RADIANS = Math.PI / 180
const MIN_MODE_GRID_POINTS = 3
const MAX_MODE_GRID_POINTS = 65
const MODE_FIELD_DISPLAY_THRESHOLD = 0.01
const LEAKAGE_MARKER_COUNT = 7
const LEAKAGE_MARKER_BASE_SIZE = 0.055
const MODE_PROFILE_MODEL_ID = 'gaussian_lp01_mode_profile'
const MODE_PROFILE_MODEL_VERSION = '1.0.0'
const GAUSSIAN_LP01_SELECTION = 'gaussian-lp01'
const IDEAL_MODE_REGIME_CUTOFF_V = 2.405
const LP01_FIELD_VERTEX_SHADER = `
attribute float normalizedField;
attribute float normalizedIntensity;
varying float fieldAmplitude;
varying float fieldIntensity;

void main() {
  fieldAmplitude = normalizedField;
  fieldIntensity = normalizedIntensity;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const LP01_FIELD_FRAGMENT_SHADER = `
precision highp float;
varying float fieldAmplitude;
varying float fieldIntensity;

vec3 fieldColor(float amplitude) {
  vec3 low = vec3(0.08, 0.18, 0.58);
  vec3 middle = vec3(0.12, 0.82, 0.92);
  vec3 high = vec3(1.0, 0.92, 0.36);
  return amplitude < 0.5
    ? mix(low, middle, amplitude * 2.0)
    : mix(middle, high, (amplitude - 0.5) * 2.0);
}

void main() {
  if (fieldIntensity < 0.01) discard;
  vec3 color = fieldColor(clamp(fieldAmplitude, 0.0, 1.0));
  float alpha = 0.12 + 0.76 * clamp(fieldIntensity, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`
const SCALAR_LP_FIELD_FRAGMENT_SHADER = `
precision highp float;
varying float fieldAmplitude;
varying float fieldIntensity;

vec3 signedFieldColor(float amplitude) {
  vec3 negative = vec3(0.08, 0.32, 1.0);
  vec3 zero = vec3(0.92, 0.95, 1.0);
  vec3 positive = vec3(1.0, 0.18, 0.08);
  return amplitude < 0.0
    ? mix(zero, negative, -amplitude)
    : mix(zero, positive, amplitude);
}

void main() {
  if (fieldIntensity < 0.01) discard;
  vec3 color = signedFieldColor(clamp(fieldAmplitude, -1.0, 1.0));
  float alpha = 0.12 + 0.76 * clamp(fieldIntensity, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`

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
  modeRegime: 'single_mode' | 'multimode'
  vNumberDimensionless: number
  modeRegimeCutoffVDimensionless: number
  cableCutoffWavelengthMaxNm: number | null
  modelId: string
  modelVersion: string
}

export type ModeProfileData = {
  modeFieldRadiusUm: number
  gridHalfWidthUm: number
  gridPoints: number
  xUm: number[]
  yUm: number[]
  normalizedField: number[][]
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
  supportedModes?: ScalarLPModeCatalog | null
  pulseAnimation: PulseAnimationData | null
  attenuation?: PowerDistanceData | null
  macrobends?: readonly MacrobendInput[] | null
  bendLoss?: MacrobendLossResult | null
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
  scalarModeProfile?: ScalarModeFieldData | null
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
  bendLossOverlayEnabled?: boolean
  attenuation?: PowerDistanceData | null
  macrobends?: readonly MacrobendInput[] | null
  bendLoss?: MacrobendLossResult | null
  fibrePath?: FibrePath
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

function scalarModeKey(mode: ScalarLPModeFamily): string {
  return `${mode.azimuthal_order}:${mode.radial_order}`
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
    (guidance.modeRegime === 'single_mode' ||
      guidance.modeRegime === 'multimode') &&
    Number.isFinite(guidance.vNumberDimensionless) &&
    guidance.vNumberDimensionless > 0 &&
    Number.isFinite(guidance.modeRegimeCutoffVDimensionless) &&
    guidance.modeRegimeCutoffVDimensionless === IDEAL_MODE_REGIME_CUTOFF_V &&
    guidance.modeRegime ===
      (guidance.vNumberDimensionless < IDEAL_MODE_REGIME_CUTOFF_V
        ? 'single_mode'
        : 'multimode') &&
    (guidance.cableCutoffWavelengthMaxNm === null ||
      (Number.isFinite(guidance.cableCutoffWavelengthMaxNm) &&
        guidance.cableCutoffWavelengthMaxNm > 0)) &&
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
    !Array.isArray(profile.normalizedField) ||
    !Array.isArray(profile.normalizedIntensity) ||
    profile.xUm.length !== profile.gridPoints ||
    profile.yUm.length !== profile.gridPoints ||
    profile.normalizedField.length !== profile.gridPoints ||
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
    profile.normalizedField.every(
      (row) =>
        Array.isArray(row) &&
        row.length === profile.gridPoints &&
        row.every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        ),
    ) &&
    profile.normalizedIntensity.every(
      (row) =>
        Array.isArray(row) &&
        row.length === profile.gridPoints &&
        row.every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        ),
    ) &&
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

function getLeakageMarkerColor(progress: number): [number, number, number] {
  const fade = 1 - progress
  return [0.98, 0.35 + fade * 0.25, 0.18 + fade * 0.12]
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

function formatModeValue(value: number): string {
  return Number.parseFloat(value.toPrecision(5)).toString()
}

function formatModeRegime(regime: RayGuidance['modeRegime']): string {
  return regime === 'single_mode' ? 'Single-mode' : 'Multimode'
}

function getSegmentGeometry(start: RayPoint, end: RayPoint) {
  return getLongitudinalSegmentTransform(start, end)
}

function RaySegment({
  name,
  start,
  end,
  color = '#ffe066',
  thickness = RAY_THICKNESS,
}: RaySegmentProps) {
  const { length, position, quaternion } = getSegmentGeometry(start, end)

  return (
    <mesh name={name} position={position} quaternion={quaternion}>
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

function RayPathMesh({
  name,
  points,
  color = '#ffe066',
  thickness = RAY_THICKNESS,
  opacity = 1,
}: {
  name: string
  points: EducationalRayPoint[]
  color?: string
  thickness?: number
  opacity?: number
}) {
  const geometry = getEducationalRayTubeGeometry(points, thickness)

  if (geometry === null) {
    return null
  }

  return (
    <mesh name={name}>
      <tubeGeometry name={`${name}-geometry`} args={geometry.args} />
      <meshBasicMaterial
        name="educational-ray-material"
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

function getLossAppearance(cumulativeLossDb: number) {
  const remainingPower = Math.pow(10, -cumulativeLossDb / 10)
  const brightness = clamp(Math.sqrt(remainingPower), 0.35, 1)

  return {
    thickness: RAY_THICKNESS * (0.55 + 0.45 * brightness),
    opacity: 0.45 + 0.55 * brightness,
    color:
      cumulativeLossDb >= 1
        ? '#d92600'
        : cumulativeLossDb > 0
          ? '#f25c05'
          : '#ffe066',
  }
}

function ReflectedRay({
  coreRadius,
  incidenceAngleDeg,
  path,
  macrobends,
  bendLoss,
}: {
  coreRadius: number
  incidenceAngleDeg: number
  path: FibrePath
  macrobends?: readonly MacrobendInput[] | null
  bendLoss?: MacrobendLossResult | null
}) {
  const chunks = buildReflectedRayPath(
    path,
    coreRadius,
    getRaySlope(incidenceAngleDeg),
    macrobends,
    bendLoss,
  )

  return (
    <group name="educational-ray-tir">
      {chunks.map((chunk, index) => {
        const appearance = getLossAppearance(chunk.cumulativeLossDb)
        return (
          <RayPathMesh
            key={`${chunk.points[0].t}-${chunk.points.at(-1)?.t}-${chunk.cumulativeLossDb}`}
            name={`educational-ray-tir-segment-${index}`}
            points={chunk.points}
            {...appearance}
          />
        )
      })}
    </group>
  )
}

function CriticalRay({
  coreRadius,
  path,
}: {
  coreRadius: number
  path: FibrePath
}) {
  return (
    <group name="educational-ray-critical-boundary">
      <RayPathMesh
        name="educational-ray-critical-boundary-segment"
        points={buildCriticalRayPath(path, coreRadius)}
      />
    </group>
  )
}

function TransmittedRay({
  coreRadius,
  path,
}: {
  coreRadius: number
  path: FibrePath
}) {
  const ray = buildTransmittedRayPath(
    path,
    coreRadius,
    CLADDING_RADIUS,
    LEAKAGE_MARKER_COUNT,
  )

  return (
    <group name="educational-ray-transmission">
      <RayPathMesh
        name="educational-ray-transmission-incident-segment"
        points={ray.incident}
        color="#ffd166"
      />
      <mesh
        name="educational-ray-leakage-point"
        position={ray.leakagePoint.position}
      >
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
        position={ray.leakagePoint.position}
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
      <RayPathMesh
        name="educational-ray-transmission-exiting-segment"
        points={ray.exiting}
        color="#ff7a59"
        thickness={RAY_THICKNESS * 0.85}
      />
      <group name="educational-ray-leakage-markers">
        {ray.leakageMarkers.map((marker, index) => {
          const progress = index / (ray.leakageMarkers.length - 1)
          const [red, green, blue] = getLeakageMarkerColor(progress)
          const size = LEAKAGE_MARKER_BASE_SIZE * (1.35 - progress * 0.55)

          return (
            <mesh
              key={`leak-${marker.t}`}
              name={`educational-ray-leakage-marker-${index}`}
              position={marker.position}
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
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

function EducationalRayLayer({
  coreRadius,
  incidenceAngleDeg,
  guidance,
  path,
  macrobends,
  bendLoss,
}: {
  coreRadius: number
  incidenceAngleDeg: number
  guidance: RayGuidance | null | undefined
  path: FibrePath
  macrobends?: readonly MacrobendInput[] | null
  bendLoss?: MacrobendLossResult | null
}) {
  const status = getRayStatus(incidenceAngleDeg, guidance)

  if (status === 'total_internal_reflection') {
    return (
      <ReflectedRay
        coreRadius={coreRadius}
        incidenceAngleDeg={incidenceAngleDeg}
        path={path}
        macrobends={macrobends}
        bendLoss={bendLoss}
      />
    )
  }

  if (status === 'critical_boundary') {
    return <CriticalRay coreRadius={coreRadius} path={path} />
  }

  if (status === 'transmission') {
    return <TransmittedRay coreRadius={coreRadius} path={path} />
  }

  return null
}

function ApproximateLP01FieldLayer({
  geometry,
  path,
}: {
  geometry: LP01PathFieldGeometry
  path: FibrePath
}) {
  return (
    <group name="approximate-lp01-field-layer">
      <mesh name="approximate-lp01-mode-field-radius-shell">
        <tubeGeometry
          name="approximate-lp01-mode-field-radius-shell-geometry"
          args={[
            path.curve,
            geometry.pathSampleCount - 1,
            geometry.modeFieldRadius,
            12,
            false,
          ]}
        />
        <meshBasicMaterial
          name="approximate-lp01-mode-field-radius-shell-material"
          color="#f8fafc"
          transparent
          opacity={0.12}
          depthWrite={false}
          toneMapped={false}
          wireframe
        />
      </mesh>
      <mesh name="approximate-lp01-field">
        <bufferGeometry name="approximate-lp01-field-geometry">
          <bufferAttribute
            attach="attributes-position"
            name="approximate-lp01-field-position-attribute"
            args={[geometry.positions, 3]}
            array={geometry.positions}
            count={geometry.vertexCount}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-normalizedField"
            name="approximate-lp01-field-amplitude-attribute"
            args={[geometry.normalizedField, 1]}
            array={geometry.normalizedField}
            count={geometry.vertexCount}
            itemSize={1}
          />
          <bufferAttribute
            attach="attributes-normalizedIntensity"
            name="approximate-lp01-field-intensity-attribute"
            args={[geometry.normalizedIntensity, 1]}
            array={geometry.normalizedIntensity}
            count={geometry.vertexCount}
            itemSize={1}
          />
          <bufferAttribute
            attach="index"
            name="approximate-lp01-field-index-attribute"
            args={[geometry.indices, 1]}
            array={geometry.indices}
            count={geometry.indices.length}
            itemSize={1}
          />
        </bufferGeometry>
        <shaderMaterial
          name="approximate-lp01-field-material"
          vertexShader={LP01_FIELD_VERTEX_SHADER}
          fragmentShader={LP01_FIELD_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
}

function ScalarLPModeFieldLayer({
  geometry,
  profile,
}: {
  geometry: ScalarLPPathFieldGeometry
  profile: ScalarModeFieldData
}) {
  return (
    <group
      name="scalar-lp-mode-field-layer"
      userData={{ modeLabel: profile.selectedMode.label }}
    >
      <mesh name="scalar-lp-mode-field">
        <bufferGeometry name="scalar-lp-mode-field-geometry">
          <bufferAttribute
            attach="attributes-position"
            name="scalar-lp-mode-field-position-attribute"
            args={[geometry.positions, 3]}
            array={geometry.positions}
            count={geometry.vertexCount}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-normalizedField"
            name="scalar-lp-mode-field-amplitude-attribute"
            args={[geometry.normalizedField, 1]}
            array={geometry.normalizedField}
            count={geometry.vertexCount}
            itemSize={1}
          />
          <bufferAttribute
            attach="attributes-normalizedIntensity"
            name="scalar-lp-mode-field-intensity-attribute"
            args={[geometry.normalizedIntensity, 1]}
            array={geometry.normalizedIntensity}
            count={geometry.vertexCount}
            itemSize={1}
          />
          <bufferAttribute
            attach="index"
            name="scalar-lp-mode-field-index-attribute"
            args={[geometry.indices, 1]}
            array={geometry.indices}
            count={geometry.indices.length}
            itemSize={1}
          />
        </bufferGeometry>
        <shaderMaterial
          name="scalar-lp-mode-field-material"
          vertexShader={LP01_FIELD_VERTEX_SHADER}
          fragmentShader={SCALAR_LP_FIELD_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
}

type ModeProfilePanelProps = {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  modeProfile: ModeProfileData | null
  supportedModes: ScalarLPModeCatalog | null
  selectedModeKey: string
  onSelectedModeKeyChange: (key: string) => void
  scalarModeField: ScalarModeFieldState
  guidance: RayGuidance | null
  coreRadiusUm: number | null
  showToggle: boolean
}

function ModeProfilePanel({
  enabled,
  onEnabledChange,
  modeProfile,
  supportedModes,
  selectedModeKey,
  onSelectedModeKeyChange,
  scalarModeField,
  guidance,
  coreRadiusUm,
  showToggle,
}: ModeProfilePanelProps) {
  const validProfile = isValidModeProfile(modeProfile)
  const gaussianAvailable =
    validProfile &&
    hasValidPhysicalCoreRadius(coreRadiusUm) &&
    hasDisplayableModeSample(modeProfile)
  const validCatalog = isScalarLPModeCatalog(supportedModes)
  const selectedFamily = validCatalog
    ? (supportedModes.mode_families.find(
        (mode) => scalarModeKey(mode) === selectedModeKey,
      ) ?? null)
    : null
  const gaussianSelected = selectedModeKey === GAUSSIAN_LP01_SELECTION
  const selectedField = scalarModeField.data
  const selectedFieldAvailable =
    selectedFamily !== null && selectedField !== null

  return (
    <>
      {showToggle && (
        <div className="geometry-layer-control">
          <label htmlFor="mode-field-view">
            <input
              id="mode-field-view"
              type="checkbox"
              checked={enabled}
              aria-describedby={enabled ? 'mode-field-explanation' : undefined}
              onChange={(event) => onEnabledChange(event.currentTarget.checked)}
            />
            Scalar mode field
          </label>
        </div>
      )}

      {enabled && (
        <>
          {validCatalog ? (
            <div className="scalar-mode-selection">
              <label htmlFor="scalar-mode-family">Displayed mode</label>
              <select
                id="scalar-mode-family"
                value={selectedModeKey}
                onChange={(event) =>
                  onSelectedModeKeyChange(event.currentTarget.value)
                }
              >
                <option value={GAUSSIAN_LP01_SELECTION}>
                  Gaussian LP01 approximation
                </option>
                {supportedModes.mode_families.map((mode) => (
                  <option key={scalarModeKey(mode)} value={scalarModeKey(mode)}>
                    {mode.label} scalar eigenmode
                  </option>
                ))}
              </select>
              <p className="mode-profile-explanation">
                {supportedModes.model_manifest.catalog_label}. The catalog has{' '}
                {supportedModes.mode_families.length} mode families
                {supportedModes.catalog_truncated ? ' and is truncated' : ''}.
              </p>
              <p className="mode-profile-explanation">
                The catalog uses exact Bessel cutoffs. The overlay keeps the
                rounded V = 2.405 guidance boundary.
              </p>
              <ul aria-label="Supported scalar mode families">
                {supportedModes.mode_families.map((mode) => (
                  <li key={mode.label}>
                    {mode.label}: ideal cutoff V ={' '}
                    {formatModeValue(mode.cutoff_v_dimensionless)}, spatial
                    degeneracy {mode.spatial_degeneracy}
                  </li>
                ))}
              </ul>
              {supportedModes.warnings.length > 0 && (
                <ul className="macrobend-model-warnings">
                  {supportedModes.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="mode-profile-status" role="status">
              The supported scalar mode catalog is unavailable.
            </p>
          )}

          <p className="mode-profile-explanation" role="note">
            Excited modes: not calculated. The source has no launch field or
            coupling coefficients in this phase.
          </p>

          {gaussianSelected && (
            <>
              {!gaussianAvailable && (
                <p className="mode-profile-status" role="status">
                  The Gaussian LP01 field is unavailable for these samples.
                </p>
              )}
              {gaussianAvailable && (
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
                    <dt>Normalized field amplitude</dt>
                    <dd>0–1, shown by color</dd>
                  </div>
                  <div>
                    <dt>Normalized intensity</dt>
                    <dd>0–1, shown by opacity</dd>
                  </div>
                  <div>
                    <dt>LP01 visibility floor</dt>
                    <dd>
                      ≥ {MODE_FIELD_DISPLAY_THRESHOLD} normalized intensity
                    </dd>
                  </div>
                  <div>
                    <dt>Path stations</dt>
                    <dd>{LP01_PATH_SAMPLE_COUNT}</dd>
                  </div>
                  <div>
                    <dt>1/e field-radius shell</dt>
                    <dd>White wireframe at the supplied radius</dd>
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
              <p
                id="mode-field-explanation"
                className="mode-profile-explanation"
              >
                This scalar weak-guidance approximation transports the circular
                Gaussian LP01 profile along the shared path. Two orthogonal
                center planes show the circular profile. Color shows normalized
                field amplitude. Opacity shows normalized intensity, which is
                proportional to |E|². The white shell marks the supplied 1/e
                field radius, which is also the 1/e² intensity radius. The
                shader hides values below 0.01 without changing backend data.
                This layer is not an exact step-index eigenmode or a full-wave
                electromagnetic solution.
              </p>
              {isValidRayGuidance(guidance) &&
                guidance.modeRegime === 'multimode' && (
                  <p className="mode-profile-explanation" role="note">
                    Select a supported scalar mode to display a higher-order
                    field. This Gaussian selection shows LP01 only.
                  </p>
                )}
            </>
          )}

          {!gaussianSelected && scalarModeField.message !== null && (
            <p className="mode-profile-status" role="status">
              {scalarModeField.message}
            </p>
          )}

          {!gaussianSelected && selectedFieldAvailable && (
            <>
              <dl className="mode-facts">
                <div>
                  <dt>Selected mode</dt>
                  <dd>{selectedField.selectedMode.label}</dd>
                </div>
                <div>
                  <dt>Effective index</dt>
                  <dd>
                    {formatModeValue(
                      selectedField.selectedMode.effective_index_dimensionless,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Propagation constant</dt>
                  <dd>
                    {formatModeValue(selectedField.selectedMode.beta_per_m)} m⁻¹
                  </dd>
                </div>
                <div>
                  <dt>Signed normalized amplitude</dt>
                  <dd>−1–1, blue to red</dd>
                </div>
                <div>
                  <dt>Normalized intensity</dt>
                  <dd>0–1, shown by opacity</dd>
                </div>
                <div>
                  <dt>Angular basis</dt>
                  <dd>{selectedField.angularBasis}</dd>
                </div>
                <div>
                  <dt>Path stations</dt>
                  <dd>{LP01_PATH_SAMPLE_COUNT}</dd>
                </div>
              </dl>
              <p
                id="mode-field-explanation"
                className="mode-profile-explanation"
              >
                {selectedField.fieldLabel}. Blue and red show opposite signs of
                one cosine representative. This scalar field follows the path on
                two center planes. It is not a full vector field.
              </p>
            </>
          )}
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
            angle. Below it, the educational ray shows leakage into the cladding
            with an orange exit path and leakage markers. Status comes from the
            backend critical angle. The ray path is schematic, not
            longitudinally or radially to scale, and is not a full-wave field
            solution.
          </p>
        </>
      )}
    </>
  )
}

function FibreOrbitControls({ onInteraction }: { onInteraction: () => void }) {
  const { camera, gl, invalidate } = useThree()
  const { domElement } = gl
  const onInteractionRef = useRef(onInteraction)

  useEffect(() => {
    onInteractionRef.current = onInteraction
  }, [onInteraction])

  useEffect(() => {
    const controls = new OrbitControls(camera, domElement)
    let cameraChanged = false
    const beginInteraction = () => {
      cameraChanged = false
    }
    const requestRender = () => {
      cameraChanged = true
      invalidate()
    }
    const finishInteraction = () => {
      if (cameraChanged) {
        onInteractionRef.current()
      }
    }
    controls.enableDamping = false
    controls.enablePan = false
    controls.minDistance = 8
    controls.maxDistance = 28
    controls.addEventListener('start', beginInteraction)
    controls.addEventListener('change', requestRender)
    controls.addEventListener('end', finishInteraction)
    controls.update()

    return () => {
      controls.removeEventListener('start', beginInteraction)
      controls.removeEventListener('change', requestRender)
      controls.removeEventListener('end', finishInteraction)
      controls.dispose()
    }
  }, [camera, domElement, invalidate])

  return null
}

export function CameraPresetController({
  preset,
}: {
  preset: CameraPresetId | null
}) {
  const { camera, invalidate } = useThree()

  useEffect(() => {
    if (preset === null) {
      return
    }

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
  curve,
  claddingVisible,
  coreMaterialProps,
}: {
  coreRadius: number
  curve: Curve<Vector3>
  claddingVisible: boolean
  coreMaterialProps: {
    transparent?: boolean
    opacity?: number
    depthWrite?: boolean
  }
}) {
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
          key={`scale-${marker.t}`}
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
            <meshBasicMaterial color="#f8fafc" toneMapped={false} />
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
          key={`power-${marker.distanceKm}-${marker.powerDbm}`}
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

function PhotonicLeakageCones({ lossDb }: { lossDb: number }) {
  const intensity = Math.max(0.4, Math.min(3.0, lossDb / 0.5))
  const coneHeight = 0.8 + intensity * 0.4
  const coneRadius = 0.22 + intensity * 0.1
  const opacity = Math.min(0.85, 0.45 + intensity * 0.15)
  const color = lossDb >= 1.0 ? '#ff1a00' : '#ff5500'

  return (
    <group name="photonic-leakage-cones">
      <group position={[0, coneHeight / 2 + 0.4, 0]} rotation={[0, 0, 0]}>
        <mesh name="leakage-cone-top">
          <coneGeometry args={[coneRadius, coneHeight, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>

      <group
        position={[0, -(coneHeight / 2 + 0.4), 0]}
        rotation={[Math.PI, 0, 0]}
      >
        <mesh name="leakage-cone-bottom">
          <coneGeometry args={[coneRadius, coneHeight, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>

      <group
        position={[0, 0, coneHeight / 2 + 0.4]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <mesh name="leakage-cone-front">
          <coneGeometry args={[coneRadius, coneHeight, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.75}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>

      <group
        position={[0, 0, -(coneHeight / 2 + 0.4)]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <mesh name="leakage-cone-back">
          <coneGeometry args={[coneRadius, coneHeight, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.75}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}

function BendLossSeverityLayer({ markers }: { markers: SpatialBendMarker[] }) {
  const maximumLocalLoss = Math.max(
    0,
    ...markers.map((marker) => marker.localLossDbPerM),
  )
  return (
    <group name="marcuse-bend-loss-severity-layer">
      {markers.map((marker, index) => {
        const normalizedSeverity =
          maximumLocalLoss === 0
            ? 0
            : Math.log1p(marker.localLossDbPerM) / Math.log1p(maximumLocalLoss)
        const lossScale = 0.4 + 2.6 * Math.sqrt(normalizedSeverity)
        const clampRadius = 0.52 + lossScale * 0.08
        const clampWidth = 0.18 + lossScale * 0.04
        const glowColor =
          marker.validity === 'outside_model_validity'
            ? '#d946ef'
            : normalizedSeverity > 0.66
              ? '#ff1a00'
              : normalizedSeverity > 0.33
                ? '#ff9f1c'
                : '#38bdf8'
        const signalOpacity = clamp(
          0.35 + 0.6 * Math.sqrt(marker.remainingPowerFraction),
          0.35,
          0.95,
        )
        return (
          <group
            key={marker.id}
            position={marker.position}
            quaternion={marker.quaternion}
          >
            <mesh
              name={`bend-clamp-metallic-${index}`}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry
                args={[clampRadius, clampRadius, clampWidth, 32]}
              />
              <meshStandardMaterial
                color="#1a202c"
                roughness={0.25}
                metalness={0.85}
                transparent
                opacity={0.95}
              />
            </mesh>

            <mesh
              name={`bend-neon-core-${index}`}
              rotation={[0, 0, Math.PI / 2]}
            >
              <torusGeometry
                args={[clampRadius * 0.98, 0.05 + lossScale * 0.02, 16, 32]}
              />
              <meshBasicMaterial
                color={glowColor}
                transparent
                opacity={signalOpacity}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>

            <mesh name={`bend-plasma-aura-${index}`}>
              <sphereGeometry args={[0.55 + lossScale * 0.15, 20, 20]} />
              <meshBasicMaterial
                color={glowColor}
                transparent
                opacity={Math.min(signalOpacity * 0.58, 0.2 + lossScale * 0.1)}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>

            <PhotonicLeakageCones lossDb={marker.lossDb} />

            <RaySegment
              name={`bend-beacon-laser-${index}`}
              start={[0, 0, 0]}
              end={[0, 1.4 + lossScale * 0.3, 0]}
              color={glowColor}
              thickness={0.025}
            />
            <mesh
              name={`bend-beacon-sphere-${index}`}
              position={[0, 1.4 + lossScale * 0.3, 0]}
            >
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshBasicMaterial
                color={glowColor}
                transparent
                opacity={signalOpacity}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        )
      })}
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
  scalarModeProfile = null,
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
  bendLossOverlayEnabled = true,
  attenuation = null,
  macrobends = null,
  bendLoss = null,
  fibrePath: suppliedFibrePath,
}: FibreGeometrySceneProps) {
  const coreRadius = getNormalisedCoreRadius(coreRadiusUm)
  const visualLength = getVisualLength(visualLengthModelUnits)
  const fibrePath =
    suppliedFibrePath ?? buildFibrePath(fibreRoute, visualLength, macrobends)
  const modeFieldGeometry =
    modeViewEnabled &&
    scalarModeProfile === null &&
    isValidModeProfile(modeProfile) &&
    hasValidPhysicalCoreRadius(coreRadiusUm)
      ? getLP01PathFieldGeometry(
          modeProfile,
          fibrePath,
          coreRadiusUm,
          coreRadius,
        )
      : null
  const scalarModeFieldGeometry =
    modeViewEnabled &&
    scalarModeProfile !== null &&
    hasValidPhysicalCoreRadius(coreRadiusUm)
      ? getScalarLPPathFieldGeometry(
          scalarModeProfile,
          fibrePath,
          coreRadiusUm,
          coreRadius,
        )
      : null
  const validPulseData = isValidPulseAnimationData(pulseAnimation)
    ? pulseAnimation
    : null
  const pulseAnimationData = pulseAnimationEnabled ? validPulseData : null
  const scaleMarkers = scaleMarkersEnabled
    ? getScaleMarkers(fibreRoute, visualLength, sectionLengthKm, 5, fibrePath)
    : []
  const powerMarkers = powerIndicatorsEnabled
    ? getSpatialPowerMarkers(
        fibreRoute,
        visualLength,
        attenuation,
        6,
        fibrePath,
      )
    : []
  const pulseMarkers = pulseMarkersEnabled
    ? getSpatialPulseMarkers(
        fibreRoute,
        visualLength,
        validPulseData,
        fibrePath,
      )
    : []
  const bendMarkers = bendLossOverlayEnabled
    ? getSpatialBendMarkers(
        fibreRoute,
        visualLength,
        macrobends,
        fibrePath,
        bendLoss,
      )
    : []
  const hasOverlay =
    rayViewEnabled ||
    modeFieldGeometry !== null ||
    scalarModeFieldGeometry !== null ||
    pulseAnimationData !== null ||
    powerMarkers.length > 0 ||
    pulseMarkers.length > 0 ||
    bendMarkers.length > 0
  const coreMaterialProps = hasOverlay
    ? { transparent: true, opacity: 0.42, depthWrite: false }
    : {}

  return (
    <group name="fibre-geometry-scene">
      {fibrePath.source === 'preset' && fibreRoute === 'straight' ? (
        <StraightFibreBody
          coreRadius={coreRadius}
          visualLength={visualLength}
          claddingVisible={claddingVisible}
          coreMaterialProps={coreMaterialProps}
        />
      ) : (
        <CurvedFibreBody
          coreRadius={coreRadius}
          curve={fibrePath.curve}
          claddingVisible={claddingVisible}
          coreMaterialProps={coreMaterialProps}
        />
      )}
      {scaleMarkers.length > 0 && <ScaleMarkerLayer markers={scaleMarkers} />}
      {powerMarkers.length > 0 && <SpatialPowerLayer markers={powerMarkers} />}
      {pulseMarkers.length > 0 && (
        <SpatialPulseMarkerLayer markers={pulseMarkers} />
      )}
      {bendMarkers.length > 0 && (
        <BendLossSeverityLayer markers={bendMarkers} />
      )}
      {rayViewEnabled && (
        <EducationalRayLayer
          coreRadius={coreRadius}
          incidenceAngleDeg={incidenceAngleDeg}
          guidance={rayGuidance}
          path={fibrePath}
          macrobends={macrobends}
          bendLoss={bendLoss}
        />
      )}
      {modeFieldGeometry !== null && (
        <ApproximateLP01FieldLayer
          geometry={modeFieldGeometry}
          path={fibrePath}
        />
      )}
      {scalarModeFieldGeometry !== null && scalarModeProfile !== null && (
        <ScalarLPModeFieldLayer
          geometry={scalarModeFieldGeometry}
          profile={scalarModeProfile}
        />
      )}
      {pulseAnimationData !== null && (
        <PulseAnimationLayer
          key={pulseAnimationResetSignal}
          data={pulseAnimationData}
          visualLength={visualLength}
          path={fibrePath}
          isPlaying={pulseAnimationPlaying}
          onComplete={onPulseAnimationComplete}
        />
      )}
    </group>
  )
}

type FibreGeometryViewportProps = {
  webglAvailable: boolean
  cameraPreset: CameraPresetId | null
  onCameraInteraction: () => void
  sceneProps: FibreGeometrySceneProps
}

function ModeRegimeOverlay({ guidance }: { guidance: RayGuidance | null }) {
  if (!isValidRayGuidance(guidance)) {
    return null
  }

  return (
    <dl
      className="mode-regime-overlay"
      data-regime={guidance.modeRegime}
      aria-label="Calculated mode regime"
    >
      <div>
        <dt>Mode regime</dt>
        <dd>{formatModeRegime(guidance.modeRegime)}</dd>
      </div>
      <div>
        <dt>V-number</dt>
        <dd>{formatModeValue(guidance.vNumberDimensionless)}</dd>
      </div>
      <div>
        <dt>Ideal step-index boundary</dt>
        <dd>V = {formatModeValue(guidance.modeRegimeCutoffVDimensionless)}</dd>
      </div>
      <div>
        <dt>G.652.D cable cut-off limit</dt>
        <dd>
          {guidance.cableCutoffWavelengthMaxNm === null
            ? 'Not applied for the custom preset'
            : `≤ ${formatModeValue(guidance.cableCutoffWavelengthMaxNm)} nm (measurement-based standard limit)`}
        </dd>
      </div>
    </dl>
  )
}

function FibreGeometryViewport({
  webglAvailable,
  cameraPreset,
  onCameraInteraction,
  sceneProps,
}: FibreGeometryViewportProps) {
  return (
    <div className="geometry-viewport">
      <ModeRegimeOverlay guidance={sceneProps.rayGuidance ?? null} />
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
          <FibreGeometryScene {...sceneProps} />
          <CameraPresetController preset={cameraPreset} />
          <FibreOrbitControls onInteraction={onCameraInteraction} />
        </Canvas>
      ) : (
        <p className="geometry-webgl-fallback" role="status">
          3D rendering is unavailable in this browser or device.
        </p>
      )}
    </div>
  )
}

type FibreShowcaseLegendProps = {
  route: FibreRouteStyle
  cameraPreset: CameraPresetId | null
  visualLength: number
  sectionLengthKm: number | null
  scaleMarkersEnabled: boolean
  powerIndicatorsEnabled: boolean
  pulseMarkersEnabled: boolean
  bendLossOverlayEnabled: boolean
  attenuation: PowerDistanceData | null
  pulseAnimation: PulseAnimationData | null
  macrobends: readonly MacrobendInput[] | null
  bendLoss: MacrobendLossResult | null
  fibrePath: FibrePath
}

function FibreShowcaseLegend({
  route,
  cameraPreset,
  visualLength,
  sectionLengthKm,
  scaleMarkersEnabled,
  powerIndicatorsEnabled,
  pulseMarkersEnabled,
  bendLossOverlayEnabled,
  attenuation,
  pulseAnimation,
  macrobends,
  bendLoss,
  fibrePath,
}: FibreShowcaseLegendProps) {
  const routeLabel =
    fibrePath.source === 'physical_bends'
      ? 'Configured planar bends'
      : (FIBRE_ROUTE_OPTIONS.find((option) => option.id === route)?.label ??
        route)
  const cameraLabel =
    cameraPreset === null
      ? 'Custom'
      : (CAMERA_PRESET_OPTIONS.find((option) => option.id === cameraPreset)
          ?.label ?? cameraPreset)
  const scaleMarkers = scaleMarkersEnabled
    ? getScaleMarkers(route, visualLength, sectionLengthKm, 5, fibrePath)
    : []
  const powerMarkers = powerIndicatorsEnabled
    ? getSpatialPowerMarkers(route, visualLength, attenuation, 6, fibrePath)
    : []
  const pulseMarkers = pulseMarkersEnabled
    ? getSpatialPulseMarkers(route, visualLength, pulseAnimation, fibrePath)
    : []
  const bendMarkers = bendLossOverlayEnabled
    ? getSpatialBendMarkers(
        route,
        visualLength,
        macrobends,
        fibrePath,
        bendLoss,
      )
    : []

  return (
    <aside
      id="showcase-legend"
      className="showcase-legend"
      aria-label="3D showcase legend"
    >
      <p>
        Route: <strong>{routeLabel}</strong> · Camera:{' '}
        <strong>{cameraLabel}</strong>
      </p>
      {fibrePath.error !== null && <p role="alert">{fibrePath.error}</p>}
      <ul>
        {fibrePath.source === 'physical_bends' && (
          <>
            <li>
              Bend angles and directions define the planar path. Radius uses a
              normalized display scale.
            </li>
            <li>
              Marcuse bend-loss overlay uses local estimated loss in dB/m:
              <ul aria-label="Bend loss values">
                {bendMarkers.map((marker, index) => (
                  <li key={marker.id}>
                    Bend {index + 1}: {formatModeValue(marker.localLossDbPerM)}{' '}
                    dB/m · {formatModeValue(marker.lossDb)} dB bend loss ·{' '}
                    {formatModeValue(marker.cumulativeLossDb)} dB cumulative
                    {' · '}
                    {formatModeValue(marker.outputPowerDbm)} dBm output
                  </li>
                ))}
              </ul>
            </li>
            <li>
              Blue-to-red markers show relative local severity. Magenta marks
              geometry outside model validity. The LP01 field colors do not
              change.
            </li>
          </>
        )}
        {scaleMarkersEnabled && (
          <li>
            Scale positions:
            <ul aria-label="Scale marker positions">
              {scaleMarkers.map((marker) => (
                <li key={marker.t}>{marker.label}</li>
              ))}
            </ul>
          </li>
        )}
        {powerIndicatorsEnabled && (
          <li>
            Backend power samples:
            {powerMarkers.length > 0 && attenuation !== null ? (
              <ul aria-label="Spatial power marker values">
                {powerMarkers.map((marker) => (
                  <li key={`${marker.distanceKm}-${marker.powerDbm}`}>
                    {marker.distanceKm} km: {marker.powerDbm} dBm
                  </li>
                ))}
              </ul>
            ) : (
              ' unavailable'
            )}
          </li>
        )}
        {pulseMarkersEnabled && (
          <li>
            Pulse FWHM markers:
            {pulseMarkers.length > 0 ? (
              <ul aria-label="Spatial pulse marker values">
                {pulseMarkers.map((marker) => (
                  <li key={marker.id}>
                    {marker.label}: {marker.fwhmPs} ps
                  </li>
                ))}
              </ul>
            ) : (
              ' unavailable'
            )}
          </li>
        )}
        <li>Educational ray and pulse animation follow the displayed path.</li>
        <li>The selected scalar mode field follows the displayed path.</li>
      </ul>
    </aside>
  )
}

function FibreGeometryFacts({
  coreRadiusUm,
  sectionLengthKm,
}: {
  coreRadiusUm: number | null
  sectionLengthKm: number | null
}) {
  return (
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
  )
}

export function FibreGeometryView({
  coreRadiusUm,
  sectionLengthKm,
  rayGuidance,
  modeProfile,
  supportedModes = null,
  pulseAnimation,
  attenuation = null,
  macrobends = null,
  bendLoss = null,
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
  const [localCameraPreset, setLocalCameraPreset] =
    useState<CameraPresetId | null>('perspective')
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
  const [selectedModeKey, setSelectedModeKey] = useState(
    GAUSSIAN_LP01_SELECTION,
  )
  const validSupportedModes = isScalarLPModeCatalog(supportedModes)
    ? supportedModes
    : null
  const selectedScalarMode =
    selectedModeKey === GAUSSIAN_LP01_SELECTION || validSupportedModes === null
      ? null
      : (validSupportedModes.mode_families.find(
          (mode) => scalarModeKey(mode) === selectedModeKey,
        ) ?? null)
  const effectiveSelectedModeKey =
    selectedModeKey !== GAUSSIAN_LP01_SELECTION && selectedScalarMode === null
      ? GAUSSIAN_LP01_SELECTION
      : selectedModeKey
  const scalarModeField = useScalarModeField(
    validSupportedModes,
    selectedScalarMode,
    modeProfile?.gridHalfWidthUm ?? null,
    modeProfile?.gridPoints ?? null,
  )
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
  const fibrePath = useMemo(
    () => buildFibrePath(fibreRoute, visualLength, macrobends),
    [fibreRoute, macrobends, visualLength],
  )
  const cameraPreset =
    visualizationSettings === undefined
      ? localCameraPreset
      : visualizationSettings.cameraPreset
  const claddingVisible = visualizationSettings?.claddingVisible ?? true
  const scaleMarkersEnabled = visualizationSettings?.scaleMarkersEnabled ?? true
  const powerIndicatorsEnabled =
    visualizationSettings?.powerIndicatorsEnabled ?? true
  const pulseMarkersEnabled = visualizationSettings?.pulseMarkersEnabled ?? true
  const bendLossOverlayEnabled =
    visualizationSettings?.bendLossOverlayEnabled ?? true
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
      } else if (key === 'cameraPreset') {
        setLocalCameraPreset(value as CameraPresetId | null)
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
  const handleCameraInteraction = useCallback(
    () => updateVisualizationSetting('cameraPreset', null),
    [updateVisualizationSetting],
  )

  return (
    <section className="geometry-card" aria-labelledby="fibre-geometry-title">
      <h2 id="fibre-geometry-title">3D fibre geometry</h2>
      <p className="model-note">
        Illustrative geometry. Drag to rotate and scroll or pinch to zoom.
      </p>

      <FibreGeometryFacts
        coreRadiusUm={coreRadiusUm}
        sectionLengthKm={sectionLengthKm}
      />

      <FibreGeometryViewport
        webglAvailable={webglAvailable}
        cameraPreset={cameraPreset}
        onCameraInteraction={handleCameraInteraction}
        sceneProps={{
          coreRadiusUm,
          sectionLengthKm,
          visualLengthModelUnits: visualLength,
          rayGuidance,
          incidenceAngleDeg,
          rayViewEnabled,
          modeProfile:
            effectiveSelectedModeKey === GAUSSIAN_LP01_SELECTION
              ? modeProfile
              : null,
          scalarModeProfile: scalarModeField.data,
          modeViewEnabled,
          pulseAnimation: pulseAnimationForScene,
          pulseAnimationEnabled,
          pulseAnimationPlaying: currentPulseAnimationPlayback.isPlaying,
          onPulseAnimationComplete: handlePulseAnimationComplete,
          pulseAnimationResetSignal: currentPulseAnimationPlayback.resetSignal,
          fibreRoute,
          claddingVisible,
          scaleMarkersEnabled,
          powerIndicatorsEnabled,
          pulseMarkersEnabled,
          bendLossOverlayEnabled,
          attenuation,
          macrobends,
          bendLoss,
          fibrePath,
        }}
      />

      <FibreShowcaseLegend
        route={fibreRoute}
        cameraPreset={cameraPreset}
        visualLength={visualLength}
        sectionLengthKm={sectionLengthKm}
        scaleMarkersEnabled={scaleMarkersEnabled}
        powerIndicatorsEnabled={powerIndicatorsEnabled}
        pulseMarkersEnabled={pulseMarkersEnabled}
        bendLossOverlayEnabled={bendLossOverlayEnabled}
        attenuation={attenuation}
        pulseAnimation={pulseAnimationForScene}
        macrobends={macrobends}
        bendLoss={bendLoss}
        fibrePath={fibrePath}
      />

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
        supportedModes={validSupportedModes}
        selectedModeKey={effectiveSelectedModeKey}
        onSelectedModeKeyChange={setSelectedModeKey}
        scalarModeField={scalarModeField}
        guidance={rayGuidance}
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
        illustrative. Longitudinal scale is compressed and not to scale. The
        preset curve styles are display-only. Configured bend radii and angles
        drive the Marcuse estimate, while their displayed radii stay normalized.
      </p>
    </section>
  )
}
