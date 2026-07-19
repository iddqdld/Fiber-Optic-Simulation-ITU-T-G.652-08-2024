import { useEffect, useRef, useState } from 'react'

import type {
  components,
  operations,
} from '../../../packages/shared_schemas/generated/api'
import {
  Level1Form,
  type CableApplication,
  type FormValues,
  type NumericFormField,
  type Preset,
} from './Level1Form'
import {
  FibreGeometryView,
  type ModeProfileData,
  type PulseAnimationData,
  type RayGuidance,
} from './FibreGeometryView'
import { Level1Preview } from './Level1Preview'
import { RadialIntensityPlot } from './RadialIntensityPlot'
import { PowerDistancePlot } from './PowerDistancePlot'
import {
  isValidPowerDistanceData,
  type PowerDistanceData,
} from './powerDistancePlot'

type PreviewRequest =
  operations['preview_level1_simulation']['requestBody']['content']['application/json']
type PreviewResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']
type HealthResponse = components['schemas']['HealthResponse']
type ErrorResponse = components['schemas']['ErrorResponse']
type PreviewWarning = PreviewResult['warnings'][number]
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
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
    !isFiniteNumber(value.input_pulse_fwhm_ps) ||
    value.input_pulse_fwhm_ps <= 0 ||
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
    value.model_manifest.model_version === '1.0.0' &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isPreviewWarning) &&
    isPreviewStandardsChecks(value.standards_checks)
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

type VisualizationData = {
  rayGuidance: RayGuidance
  modeProfile: ModeProfileData
  pulseAnimation: PulseAnimationData
  attenuation: PowerDistanceData
}

function App() {
  const [backendStatus, setBackendStatus] = useState('Checking backend…')
  const [previewStatus, setPreviewStatus] = useState('Waiting for preview…')
  const [formValues, setFormValues] = useState(initialFormValues)
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [visualizationData, setVisualizationData] =
    useState<VisualizationData | null>(null)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const previewSequence = useRef(0)
  const resultRef = useRef<PreviewResult | null>(null)
  const formValidation = parseFormValues(formValues)
  const geometryValues = getGeometryValues(formValues)
  const error = formValidation.error ?? serviceError

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
        const data: unknown = await response.json().catch(() => null)

        if (response.ok && isHealthResponse(data)) {
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
          const body: unknown = await response.json().catch(() => null)

          if (
            controller.signal.aborted ||
            previewSequence.current !== requestId
          ) {
            return
          }

          if (!response.ok) {
            setVisualizationData(null)
            setServiceError(getErrorMessage(body) ?? PREVIEW_FAILED)
            setPreviewStatus('Preview unavailable.')
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

  return (
    <main>
      <h1>Optical Fibre Simulator</h1>
      <p>Configure one fibre section and get an immediate Level 1 preview.</p>
      <p
        className="backend-status"
        role="status"
        aria-label="Backend status"
        aria-live="polite"
      >
        {backendStatus} ·{' '}
        {formValidation.error !== null ? 'Preview paused.' : previewStatus}
      </p>

      <Level1Form
        values={formValues}
        error={error}
        onNumericFieldChange={updateNumericField}
        onPresetChange={updatePreset}
        onCableApplicationChange={updateCableApplication}
      />
      <div className="preview-column">
        <FibreGeometryView
          coreRadiusUm={geometryValues.coreRadiusUm}
          sectionLengthKm={geometryValues.sectionLengthKm}
          rayGuidance={visualizationData?.rayGuidance ?? null}
          modeProfile={visualizationData?.modeProfile ?? null}
          pulseAnimation={visualizationData?.pulseAnimation ?? null}
        />
        {result && <Level1Preview result={result} />}
      </div>
      <RadialIntensityPlot
        modeProfile={visualizationData?.modeProfile ?? null}
      />
      <PowerDistancePlot attenuation={visualizationData?.attenuation ?? null} />
    </main>
  )
}

export default App
