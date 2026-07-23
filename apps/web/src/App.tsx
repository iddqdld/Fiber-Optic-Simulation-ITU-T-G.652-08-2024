import { useEffect, useRef, useState, type ReactNode } from 'react'

import type {
  components,
  operations,
} from '../../../packages/shared_schemas/generated/api'
import {
  type CableApplication,
  type FieldBoundaries,
  type FormValues,
  type NumericFormField,
  type Preset,
} from './Level1Form'
import { ComparisonWorkspace } from './ComparisonWorkspace'
import {
  FibreGeometryView,
  type ModeProfileData,
  type PulseAnimationData,
  type RayGuidance,
} from './FibreGeometryView'
import {
  EditorShell,
  type PreviewStateTone,
  type WorkspaceId,
} from './EditorShell'
import { getFieldIssues } from './fieldIssues'
import { GraphWorkspace } from './GraphWorkspace'
import type { GraphWorkspaceId } from './graphWorkspaceCatalog'
import { Level1Preview } from './Level1Preview'
import { isMacrobendLossResult, macrobendInputsMatch } from './macrobend'
import { SimulationInspector } from './SimulationInspector'
import { StandardsWorkspace } from './StandardsWorkspace'
import { SweepWorkspace } from './SweepWorkspace'
import { defaultVisualizationSettings } from './visualizationSettings'
import {
  isValidPowerDistanceData,
  type PowerDistanceData,
} from './powerDistancePlot'
import type { PulseComparisonData } from './pulseComparisonPlot'

type PreviewRequest =
  operations['preview_level1_simulation']['requestBody']['content']['application/json']
type PreviewResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']
type HealthResponse = components['schemas']['HealthResponse']
type ErrorResponse = components['schemas']['ErrorResponse']
type PreviewWarning = PreviewResult['warnings'][number]
type PreviewBoundary = PreviewResult['parameter_boundaries'][number]
type ModeProfileResult = PreviewResult['mode_profile']
type StandardsChecks = PreviewResult['standards_checks']
type AttenuationCheck = NonNullable<StandardsChecks['attenuation']>
type DispersionCheck = NonNullable<StandardsChecks['dispersion']>

const initialFormValues: FormValues = {
  preset: 'custom',
  n_core: '1.47',
  n_cladding: '1.465',
  core_radius_um: '4.1',
  mode_field_radius_um: '4.82',
  attenuation_db_per_km: '0.2',
  dispersion_ps_per_nm_km: '17',
  group_index_dimensionless: '1.468',
  cable_application: 'standard_cable',
  wavelength_nm: '1550',
  input_power_dbm: '-3',
  spectral_width_fwhm_nm: '0.2',
  input_pulse_fwhm_ps: '25',
  length_km: '12.5',
  grid_half_width_um: '15',
  grid_points: '65',
}

const INVALID_CONFIGURATION = 'Invalid configuration. Check the entered values.'
const PREVIEW_FAILED = 'Preview failed.'
const PREVIEW_UNREACHABLE = 'Unable to reach the preview service.'
const numericFormFields = [
  'n_core',
  'n_cladding',
  'core_radius_um',
  'mode_field_radius_um',
  'attenuation_db_per_km',
  'dispersion_ps_per_nm_km',
  'group_index_dimensionless',
  'wavelength_nm',
  'input_power_dbm',
  'spectral_width_fwhm_nm',
  'input_pulse_fwhm_ps',
  'length_km',
  'grid_half_width_um',
  'grid_points',
] as const satisfies readonly NumericFormField[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNumericFormField(value: unknown): value is NumericFormField {
  return (
    typeof value === 'string' &&
    numericFormFields.includes(value as NumericFormField)
  )
}

function isPreviewBoundary(value: unknown): value is PreviewBoundary {
  return (
    isRecord(value) &&
    isNumericFormField(value.field) &&
    (value.kind === 'input' ||
      value.kind === 'model' ||
      value.kind === 'standard') &&
    typeof value.label === 'string' &&
    value.label.trim().length > 0 &&
    typeof value.range_text === 'string' &&
    value.range_text.trim().length > 0 &&
    Array.isArray(value.depends_on) &&
    value.depends_on.every(isNumericFormField) &&
    typeof value.source_model_id === 'string' &&
    value.source_model_id.trim().length > 0
  )
}

function isPreviewBoundaries(
  value: unknown,
): value is PreviewResult['parameter_boundaries'] {
  if (!Array.isArray(value) || !value.every(isPreviewBoundary)) {
    return false
  }

  const inputFields = new Set<NumericFormField>()

  for (const boundary of value) {
    if (boundary.kind === 'input') {
      inputFields.add(boundary.field)
    }
  }

  return numericFormFields.every((field) => inputFields.has(field))
}

function toFieldBoundaries(
  boundaries: PreviewResult['parameter_boundaries'],
): FieldBoundaries {
  const grouped: FieldBoundaries = {}

  for (const boundary of boundaries) {
    grouped[boundary.field] = [
      ...(grouped[boundary.field] ?? []),
      {
        kind: boundary.kind,
        label: boundary.label,
        rangeText: boundary.range_text,
        dependsOn: boundary.depends_on,
        sourceModelId: boundary.source_model_id,
      },
    ]
  }

  return grouped
}

function isFiniteNumberArray(
  value: unknown,
  length: number,
): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(isFiniteNumber)
  )
}

function isNormalizedGrid(
  value: unknown,
  gridPoints: number,
): value is number[][] {
  return (
    Array.isArray(value) &&
    value.length === gridPoints &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === gridPoints &&
        row.every(
          (sample) => isFiniteNumber(sample) && sample >= 0 && sample <= 1,
        ),
    )
  )
}

function isPreset(value: string): value is Preset {
  return value === 'custom' || value === 'g652d'
}

function parseFinite(value: string): number | null {
  if (value.trim() === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getGeometryValues(values: FormValues): {
  coreRadiusUm: number | null
  sectionLengthKm: number | null
} {
  const coreRadius = parseFinite(values.core_radius_um)
  const sectionLength = parseFinite(values.length_km)

  return {
    coreRadiusUm: coreRadius !== null && coreRadius > 0 ? coreRadius : null,
    sectionLengthKm:
      sectionLength !== null && sectionLength >= 0 ? sectionLength : null,
  }
}

function parseFormValues(values: FormValues): {
  request: PreviewRequest | null
  error: string | null
} {
  const nCore = parseFinite(values.n_core)
  const nCladding = parseFinite(values.n_cladding)
  const coreRadius = parseFinite(values.core_radius_um)
  const modeFieldRadius = parseFinite(values.mode_field_radius_um)
  const attenuation = parseFinite(values.attenuation_db_per_km)
  const dispersion = parseFinite(values.dispersion_ps_per_nm_km)
  const groupIndex = parseFinite(values.group_index_dimensionless)
  const wavelength = parseFinite(values.wavelength_nm)
  const inputPower = parseFinite(values.input_power_dbm)
  const spectralWidth = parseFinite(values.spectral_width_fwhm_nm)
  const inputPulse = parseFinite(values.input_pulse_fwhm_ps)
  const length = parseFinite(values.length_km)
  const gridHalfWidth = parseFinite(values.grid_half_width_um)
  const gridPoints = parseFinite(values.grid_points)

  if (
    nCore === null ||
    nCladding === null ||
    coreRadius === null ||
    modeFieldRadius === null ||
    attenuation === null ||
    dispersion === null ||
    groupIndex === null ||
    wavelength === null ||
    inputPower === null ||
    spectralWidth === null ||
    inputPulse === null ||
    length === null ||
    gridHalfWidth === null ||
    gridPoints === null
  ) {
    return { request: null, error: INVALID_CONFIGURATION }
  }

  if (
    nCore <= 0 ||
    nCladding <= 0 ||
    coreRadius <= 0 ||
    modeFieldRadius <= 0 ||
    groupIndex <= 0 ||
    wavelength <= 0 ||
    inputPulse <= 0 ||
    gridHalfWidth <= 0 ||
    attenuation < 0 ||
    spectralWidth < 0 ||
    length < 0 ||
    nCore <= nCladding ||
    !Number.isInteger(gridPoints) ||
    gridPoints < 3 ||
    gridPoints > 65 ||
    gridPoints % 2 === 0 ||
    (values.preset === 'g652d' && (wavelength < 1260 || wavelength > 1625))
  ) {
    return { request: null, error: INVALID_CONFIGURATION }
  }

  const request: PreviewRequest = {
    preset: values.preset,
    fibre: {
      n_core: nCore,
      n_cladding: nCladding,
      core_radius_um: coreRadius,
      mode_field_radius_um: modeFieldRadius,
      attenuation_db_per_km: attenuation,
      dispersion_ps_per_nm_km: dispersion,
      group_index_dimensionless: groupIndex,
      cable_application: values.cable_application,
    },
    source: {
      wavelength_nm: wavelength,
      input_power_dbm: inputPower,
      spectral_width_fwhm_nm: spectralWidth,
      input_pulse_fwhm_ps: inputPulse,
    },
    section: {
      length_km: length,
      bends: [],
    },
    sampling: {
      grid_half_width_um: gridHalfWidth,
      grid_points: gridPoints,
    },
  }

  return { request, error: null }
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return isRecord(value) && value.status === 'ok'
}

function getErrorMessage(
  value: unknown,
): ErrorResponse['error']['message'] | null {
  return isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.message === 'string' &&
    value.error.message.trim().length > 0
    ? value.error.message
    : null
}

function isPreviewWarning(value: unknown): value is PreviewWarning {
  return (
    isRecord(value) &&
    (value.code === 'air_acceptance_angle_unavailable' ||
      value.code === 'mode_count_unavailable' ||
      value.code === 'g652d_attenuation_not_applicable') &&
    typeof value.message === 'string'
  )
}

function isAttenuationCheck(value: unknown): value is AttenuationCheck {
  return (
    isRecord(value) &&
    (value.status === 'pass' ||
      value.status === 'fail_above_maximum' ||
      value.status === 'not_applicable')
  )
}

function isDispersionCheck(value: unknown): value is DispersionCheck {
  return (
    isRecord(value) &&
    (value.status === 'pass' ||
      value.status === 'fail_below_minimum' ||
      value.status === 'fail_above_maximum')
  )
}

function isPreviewStandardsChecks(value: unknown): value is StandardsChecks {
  if (
    !isRecord(value) ||
    typeof value.preset !== 'string' ||
    !isPreset(value.preset)
  ) {
    return false
  }

  if (value.preset === 'custom') {
    return value.attenuation === null && value.dispersion === null
  }

  return (
    isAttenuationCheck(value.attenuation) && isDispersionCheck(value.dispersion)
  )
}

function isModeProfileResult(value: unknown): value is ModeProfileResult {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.mode_field_radius_um) ||
    value.mode_field_radius_um <= 0 ||
    !isFiniteNumber(value.grid_half_width_um) ||
    value.grid_half_width_um <= 0 ||
    !isFiniteNumber(value.grid_points) ||
    !Number.isInteger(value.grid_points) ||
    value.grid_points < 3 ||
    value.grid_points > 65 ||
    value.grid_points % 2 === 0 ||
    !isFiniteNumberArray(value.x_um, value.grid_points) ||
    !isFiniteNumberArray(value.y_um, value.grid_points) ||
    !isNormalizedGrid(value.normalized_field, value.grid_points) ||
    !isNormalizedGrid(value.normalized_intensity, value.grid_points) ||
    !isRecord(value.model_manifest)
  ) {
    return false
  }

  return (
    value.model_manifest.model_id === 'gaussian_lp01_mode_profile' &&
    value.model_manifest.model_version === '1.0.0' &&
    value.model_manifest.normalization_convention ===
      'unit_peak_field_and_intensity' &&
    value.model_manifest.radius_convention === '1/e_field_radius'
  )
}

function isGroupDelayResult(
  value: unknown,
): value is PreviewResult['group_delay'] {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.group_delay_ps) ||
    value.group_delay_ps < 0 ||
    !isFiniteNumber(value.length_km) ||
    value.length_km < 0 ||
    !isRecord(value.model_manifest)
  ) {
    return false
  }

  return (
    value.model_manifest.model_id === 'constant_group_index_delay' &&
    value.model_manifest.model_version === '1.0.0'
  )
}

function isPulseBroadeningResult(
  value: unknown,
): value is PreviewResult['pulse_broadening'] {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.dispersion_ps_per_nm_km) ||
    !isFiniteNumber(value.spectral_width_fwhm_nm) ||
    value.spectral_width_fwhm_nm < 0 ||
    !isFiniteNumber(value.input_pulse_fwhm_ps) ||
    value.input_pulse_fwhm_ps <= 0 ||
    !isFiniteNumber(value.accumulated_dispersion_ps_per_nm) ||
    !isFiniteNumber(value.output_pulse_fwhm_ps) ||
    value.output_pulse_fwhm_ps < value.input_pulse_fwhm_ps ||
    !isFiniteNumber(value.dispersion_broadening_fwhm_ps) ||
    value.dispersion_broadening_fwhm_ps < 0 ||
    !isFiniteNumber(value.length_km) ||
    value.length_km < 0 ||
    !isRecord(value.model_manifest)
  ) {
    return false
  }

  return (
    value.model_manifest.model_id ===
      'first_order_chromatic_pulse_broadening' &&
    value.model_manifest.model_version === '1.0.0' &&
    value.model_manifest.width_convention === 'fwhm'
  )
}

function isAttenuationResult(
  value: unknown,
): value is PreviewResult['attenuation'] {
  if (!isRecord(value) || !isRecord(value.model_manifest)) {
    return false
  }

  return isValidPowerDistanceData({
    lengthKm: value.length_km,
    attenuationDbPerKm: value.attenuation_db_per_km,
    inputPowerDbm: value.input_power_dbm,
    sectionLossDb: value.section_loss_db,
    outputPowerDbm: value.output_power_dbm,
    distanceSamplesKm: value.distance_samples_km,
    powerSamplesDbm: value.power_samples_dbm,
    modelId: value.model_manifest.model_id,
    modelVersion: value.model_manifest.model_version,
  })
}

function isPreviewResult(value: unknown): value is PreviewResult {
  if (!isRecord(value)) {
    return false
  }

  if (!isRecord(value.guidance)) {
    return false
  }

  const guidance = value.guidance

  if (
    !isFiniteNumber(guidance.critical_angle_deg) ||
    guidance.critical_angle_deg <= 0 ||
    guidance.critical_angle_deg >= 90 ||
    !isRecord(guidance.model_manifest) ||
    guidance.model_manifest.model_id !== 'ideal_circular_step_index_guidance' ||
    guidance.model_manifest.model_version !== '1.0.0'
  ) {
    return false
  }

  if (
    !isGroupDelayResult(value.group_delay) ||
    !isPulseBroadeningResult(value.pulse_broadening) ||
    !isAttenuationResult(value.attenuation) ||
    !isMacrobendLossResult(value.bend_loss) ||
    value.bend_loss.input_power_dbm !== value.attenuation.output_power_dbm ||
    value.attenuation.length_km !== value.group_delay.length_km ||
    value.group_delay.length_km !== value.pulse_broadening.length_km
  ) {
    return false
  }

  return (
    (guidance.mode_regime === 'single_mode' ||
      guidance.mode_regime === 'multimode') &&
    isFiniteNumber(guidance.v_number_dimensionless) &&
    isFiniteNumber(guidance.numerical_aperture_dimensionless) &&
    isModeProfileResult(value.mode_profile) &&
    isRecord(value.model_manifest) &&
    value.model_manifest.model_id === 'level1_single_section_simulation' &&
    value.model_manifest.model_version === '1.1.0' &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isPreviewWarning) &&
    isPreviewStandardsChecks(value.standards_checks) &&
    isPreviewBoundaries(value.parameter_boundaries)
  )
}

function toPowerDistanceData(
  value: PreviewResult['attenuation'],
): PowerDistanceData {
  return {
    lengthKm: value.length_km,
    attenuationDbPerKm: value.attenuation_db_per_km,
    inputPowerDbm: value.input_power_dbm,
    sectionLossDb: value.section_loss_db,
    outputPowerDbm: value.output_power_dbm,
    distanceSamplesKm: value.distance_samples_km,
    powerSamplesDbm: value.power_samples_dbm,
    modelId: value.model_manifest.model_id,
    modelVersion: value.model_manifest.model_version,
  }
}

function toModeProfileData(value: ModeProfileResult): ModeProfileData {
  return {
    modeFieldRadiusUm: value.mode_field_radius_um,
    gridHalfWidthUm: value.grid_half_width_um,
    gridPoints: value.grid_points,
    xUm: value.x_um,
    yUm: value.y_um,
    normalizedIntensity: value.normalized_intensity,
    modelId: value.model_manifest.model_id,
    modelVersion: value.model_manifest.model_version,
    normalizationConvention: value.model_manifest.normalization_convention,
    radiusConvention: value.model_manifest.radius_convention,
  }
}

function toPulseAnimationData(value: PreviewResult): PulseAnimationData {
  return {
    inputPulseFwhmPs: value.pulse_broadening.input_pulse_fwhm_ps,
    outputPulseFwhmPs: value.pulse_broadening.output_pulse_fwhm_ps,
    dispersionBroadeningFwhmPs:
      value.pulse_broadening.dispersion_broadening_fwhm_ps,
    sectionLengthKm: value.pulse_broadening.length_km,
    groupDelayPs: value.group_delay.group_delay_ps,
    modelId: value.pulse_broadening.model_manifest.model_id,
    modelVersion: value.pulse_broadening.model_manifest.model_version,
    widthConvention: value.pulse_broadening.model_manifest.width_convention,
    delayModelId: value.group_delay.model_manifest.model_id,
    delayModelVersion: value.group_delay.model_manifest.model_version,
  }
}

function toPulseComparisonData(
  value: PreviewResult['pulse_broadening'],
): PulseComparisonData {
  return {
    lengthKm: value.length_km,
    dispersionPsPerNmKm: value.dispersion_ps_per_nm_km,
    spectralWidthFwhmNm: value.spectral_width_fwhm_nm,
    inputPulseFwhmPs: value.input_pulse_fwhm_ps,
    accumulatedDispersionPsPerNm: value.accumulated_dispersion_ps_per_nm,
    dispersionBroadeningFwhmPs: value.dispersion_broadening_fwhm_ps,
    outputPulseFwhmPs: value.output_pulse_fwhm_ps,
    modelId: value.model_manifest.model_id,
    modelVersion: value.model_manifest.model_version,
    widthConvention: value.model_manifest.width_convention,
  }
}

type VisualizationData = {
  rayGuidance: RayGuidance
  modeProfile: ModeProfileData
  pulseAnimation: PulseAnimationData
  pulseComparison: PulseComparisonData
  attenuation: PowerDistanceData
}

function defaultResultDrawerOpen(): boolean {
  return typeof window.matchMedia !== 'function'
    ? true
    : window.matchMedia('(min-width: 1400px)').matches
}

function resultMatchesRequest(
  request: PreviewRequest | null,
  result: PreviewResult | null,
): boolean {
  if (request === null || result === null) {
    return false
  }

  const configuration = result.configuration
  if (
    !isRecord(configuration) ||
    !isRecord(configuration.fibre) ||
    !isRecord(configuration.source) ||
    !isRecord(configuration.section) ||
    !isRecord(configuration.sampling)
  ) {
    return false
  }

  const requestBends = request.section.bends ?? []
  if (
    !Array.isArray(configuration.section.bends) ||
    !macrobendInputsMatch(requestBends, configuration.section.bends)
  ) {
    return false
  }

  if (
    !macrobendInputsMatch(configuration.section.bends, result.bend_loss.bends)
  ) {
    return false
  }

  return (
    request.preset === configuration.preset &&
    request.fibre.n_core === configuration.fibre.n_core &&
    request.fibre.n_cladding === configuration.fibre.n_cladding &&
    request.fibre.core_radius_um === configuration.fibre.core_radius_um &&
    request.fibre.mode_field_radius_um ===
      configuration.fibre.mode_field_radius_um &&
    request.fibre.attenuation_db_per_km ===
      configuration.fibre.attenuation_db_per_km &&
    request.fibre.dispersion_ps_per_nm_km ===
      configuration.fibre.dispersion_ps_per_nm_km &&
    request.fibre.group_index_dimensionless ===
      configuration.fibre.group_index_dimensionless &&
    request.fibre.cable_application === configuration.fibre.cable_application &&
    request.source.wavelength_nm === configuration.source.wavelength_nm &&
    request.source.input_power_dbm === configuration.source.input_power_dbm &&
    request.source.spectral_width_fwhm_nm ===
      configuration.source.spectral_width_fwhm_nm &&
    request.source.input_pulse_fwhm_ps ===
      configuration.source.input_pulse_fwhm_ps &&
    request.section.length_km === configuration.section.length_km &&
    request.sampling.grid_half_width_um ===
      configuration.sampling.grid_half_width_um &&
    request.sampling.grid_points === configuration.sampling.grid_points
  )
}

function App() {
  const [backendStatus, setBackendStatus] = useState('Checking backend…')
  const [previewStatus, setPreviewStatus] = useState('Waiting for preview…')
  const [formValues, setFormValues] = useState(initialFormValues)
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [comparisonBaseline, setComparisonBaseline] =
    useState<PreviewResult | null>(null)
  const [visualizationData, setVisualizationData] =
    useState<VisualizationData | null>(null)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('scene')
  const [activeGraph, setActiveGraph] = useState<GraphWorkspaceId>(
    'lp01-radial-intensity',
  )
  const [resultDrawerOpen, setResultDrawerOpen] = useState(
    defaultResultDrawerOpen,
  )
  const [visualizationSettings, setVisualizationSettings] = useState(
    defaultVisualizationSettings,
  )
  const previewSequence = useRef(0)
  const resultRef = useRef<PreviewResult | null>(null)
  const formValidation = parseFormValues(formValues)
  const geometryValues = getGeometryValues(formValues)
  const error = formValidation.error ?? serviceError
  const matchingResult = resultMatchesRequest(formValidation.request, result)
    ? result
    : null
  const fieldIssues = getFieldIssues(formValues, matchingResult)
  const fieldBoundaries =
    matchingResult === null
      ? {}
      : toFieldBoundaries(matchingResult.parameter_boundaries)

  const clearVisualizationData = () => {
    previewSequence.current += 1
    setVisualizationData(null)
  }

  useEffect(() => {
    const controller = new AbortController()

    const checkBackendHealth = async () => {
      try {
        const response = await fetch('/api/v1/health', {
          signal: controller.signal,
        })

        if (controller.signal.aborted) {
          return
        }

        if (!response.ok) {
          setBackendStatus('Backend unavailable')
          return
        }

        const data: unknown = await response.json().catch(() => null)

        if (isHealthResponse(data)) {
          setBackendStatus('Backend available')
        } else {
          setBackendStatus('Backend unavailable')
        }
      } catch {
        if (controller.signal.aborted) {
          return
        }

        setBackendStatus('Backend unavailable')
      }
    }

    void checkBackendHealth()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const requestId = previewSequence.current + 1
    previewSequence.current = requestId
    const controller = new AbortController()
    const parsed = parseFormValues(formValues)

    if (parsed.error !== null || parsed.request === null) {
      return () => controller.abort()
    }

    const request = parsed.request
    const timer = window.setTimeout(() => {
      const fetchPreview = async () => {
        setVisualizationData(null)
        setPreviewStatus(
          resultRef.current === null ? 'Loading preview…' : 'Updating preview…',
        )

        try {
          const response = await fetch('/api/v1/simulations/preview', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
            signal: controller.signal,
          })

          if (
            controller.signal.aborted ||
            previewSequence.current !== requestId
          ) {
            return
          }

          if (!response.ok) {
            const body: unknown = await response.json().catch(() => null)

            if (
              controller.signal.aborted ||
              previewSequence.current !== requestId
            ) {
              return
            }

            setVisualizationData(null)
            setServiceError(getErrorMessage(body) ?? PREVIEW_FAILED)
            setPreviewStatus('Preview unavailable.')
            return
          }

          const body: unknown = await response.json().catch(() => null)

          if (
            controller.signal.aborted ||
            previewSequence.current !== requestId
          ) {
            return
          }

          if (!isPreviewResult(body)) {
            setVisualizationData(null)
            setServiceError(PREVIEW_FAILED)
            setPreviewStatus('Preview unavailable.')
            return
          }

          resultRef.current = body
          setResult(body)
          setVisualizationData({
            rayGuidance: {
              criticalAngleDeg: body.guidance.critical_angle_deg,
              modelId: body.guidance.model_manifest.model_id,
              modelVersion: body.guidance.model_manifest.model_version,
            },
            modeProfile: toModeProfileData(body.mode_profile),
            pulseAnimation: toPulseAnimationData(body),
            pulseComparison: toPulseComparisonData(body.pulse_broadening),
            attenuation: toPowerDistanceData(body.attenuation),
          })
          setServiceError(null)
          setPreviewStatus('Preview ready')
        } catch {
          if (
            controller.signal.aborted ||
            previewSequence.current !== requestId
          ) {
            return
          }

          setVisualizationData(null)
          setServiceError(PREVIEW_UNREACHABLE)
          setPreviewStatus('Preview unavailable.')
        }
      }

      void fetchPreview()
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [formValues])

  const updateNumericField = (field: NumericFormField, value: string) => {
    clearVisualizationData()
    setServiceError(null)
    setPreviewStatus('Preview scheduled…')
    setFormValues((current) => ({ ...current, [field]: value }))
  }

  const updatePreset = (preset: Preset) => {
    clearVisualizationData()
    setServiceError(null)
    setPreviewStatus('Preview scheduled…')
    setFormValues((current) => {
      if (preset === 'g652d') {
        return {
          ...current,
          preset,
          wavelength_nm: '1550',
          attenuation_db_per_km: '0.275',
          dispersion_ps_per_nm_km: '17',
        }
      }

      return { ...current, preset }
    })
  }

  const updateCableApplication = (value: CableApplication) => {
    clearVisualizationData()
    setServiceError(null)
    setPreviewStatus('Preview scheduled…')
    setFormValues((current) => ({ ...current, cable_application: value }))
  }

  const captureComparisonBaseline = () => {
    if (matchingResult !== null) {
      setComparisonBaseline(matchingResult)
    }
  }

  const displayPreviewStatus =
    formValidation.error !== null ? 'Validation issue' : previewStatus
  const previewStateTone: PreviewStateTone =
    formValidation.error !== null
      ? 'warning'
      : serviceError !== null
        ? 'error'
        : previewStatus === 'Preview ready'
          ? 'success'
          : previewStatus.includes('Loading') ||
              previewStatus.includes('Updating') ||
              previewStatus.includes('scheduled')
            ? 'info'
            : 'neutral'
  const backendHealthy = backendStatus === 'Backend available'
  const warningCount = result?.warnings.length ?? 0
  const modelLabel = result
    ? `${result.model_manifest.model_id} · ${result.model_manifest.model_version}`
    : 'Level 1 single-section model'
  const sweepConfigurationKey =
    formValidation.request === null
      ? 'invalid-configuration'
      : JSON.stringify(formValidation.request)

  let workspace: ReactNode

  if (activeWorkspace === 'scene') {
    workspace = (
      <div className="scene-workspace">
        <FibreGeometryView
          coreRadiusUm={geometryValues.coreRadiusUm}
          sectionLengthKm={geometryValues.sectionLengthKm}
          rayGuidance={visualizationData?.rayGuidance ?? null}
          modeProfile={visualizationData?.modeProfile ?? null}
          pulseAnimation={visualizationData?.pulseAnimation ?? null}
          attenuation={visualizationData?.attenuation ?? null}
          visualizationSettings={visualizationSettings}
          onVisualizationSettingsChange={setVisualizationSettings}
          showConfigurationControls={false}
        />
      </div>
    )
  } else if (activeWorkspace === 'graphs') {
    workspace = (
      <GraphWorkspace
        activeGraph={activeGraph}
        onActiveGraphChange={setActiveGraph}
        modeProfile={visualizationData?.modeProfile ?? null}
        attenuation={visualizationData?.attenuation ?? null}
        pulseComparison={visualizationData?.pulseComparison ?? null}
      />
    )
  } else if (activeWorkspace === 'standards') {
    workspace = (
      <StandardsWorkspace standardsChecks={result?.standards_checks ?? null} />
    )
  } else if (activeWorkspace === 'compare') {
    workspace = (
      <ComparisonWorkspace
        baseline={comparisonBaseline}
        variant={matchingResult}
        onCaptureBaseline={captureComparisonBaseline}
        onClearBaseline={() => setComparisonBaseline(null)}
      />
    )
  } else {
    workspace = (
      <SweepWorkspace
        key={sweepConfigurationKey}
        baseConfiguration={formValidation.request}
      />
    )
  }

  const inspector = (
    <SimulationInspector
      values={formValues}
      error={error}
      fieldIssues={fieldIssues}
      fieldBoundaries={fieldBoundaries}
      settings={visualizationSettings}
      rayGuidance={visualizationData?.rayGuidance ?? null}
      onNumericFieldChange={updateNumericField}
      onPresetChange={updatePreset}
      onCableApplicationChange={updateCableApplication}
      onSettingsChange={setVisualizationSettings}
    />
  )

  const resultDrawer = result ? (
    <Level1Preview result={result} />
  ) : (
    <p className="result-drawer-empty">
      A validated numerical preview will appear here.
    </p>
  )

  return (
    <EditorShell
      activeWorkspace={activeWorkspace}
      onWorkspaceChange={setActiveWorkspace}
      previewStateLabel={displayPreviewStatus}
      previewStateTone={previewStateTone}
      backendLabel={backendStatus}
      backendHealthy={backendHealthy}
      warningCount={warningCount}
      resultDrawerOpen={resultDrawerOpen}
      onResultDrawerToggle={() => setResultDrawerOpen((open) => !open)}
      modelLabel={modelLabel}
      inspector={inspector}
      workspace={workspace}
      resultDrawer={resultDrawer}
    />
  )
}

export default App
