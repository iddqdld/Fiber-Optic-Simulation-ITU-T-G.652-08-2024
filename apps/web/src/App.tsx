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
import { FibreGeometryView, type RayGuidance } from './FibreGeometryView'
import { Level1Preview } from './Level1Preview'

type PreviewRequest =
  operations['preview_level1_simulation']['requestBody']['content']['application/json']
type PreviewResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']
type HealthResponse = components['schemas']['HealthResponse']
type ErrorResponse = components['schemas']['ErrorResponse']
type PreviewWarning = PreviewResult['warnings'][number]
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

  return (
    (guidance.mode_regime === 'single_mode' ||
      guidance.mode_regime === 'multimode') &&
    isFiniteNumber(guidance.v_number_dimensionless) &&
    isFiniteNumber(guidance.numerical_aperture_dimensionless) &&
    isRecord(value.attenuation) &&
    isFiniteNumber(value.attenuation.section_loss_db) &&
    isFiniteNumber(value.attenuation.output_power_dbm) &&
    isRecord(value.group_delay) &&
    isFiniteNumber(value.group_delay.group_delay_ps) &&
    isRecord(value.pulse_broadening) &&
    isFiniteNumber(value.pulse_broadening.input_pulse_fwhm_ps) &&
    isFiniteNumber(value.pulse_broadening.output_pulse_fwhm_ps) &&
    isRecord(value.model_manifest) &&
    value.model_manifest.model_id === 'level1_single_section_simulation' &&
    value.model_manifest.model_version === '1.0.0' &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isPreviewWarning) &&
    isPreviewStandardsChecks(value.standards_checks)
  )
}

function App() {
  const [backendStatus, setBackendStatus] = useState('Checking backend…')
  const [previewStatus, setPreviewStatus] = useState('Waiting for preview…')
  const [formValues, setFormValues] = useState(initialFormValues)
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [rayGuidance, setRayGuidance] = useState<RayGuidance | null>(null)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const previewSequence = useRef(0)
  const resultRef = useRef<PreviewResult | null>(null)
  const formValidation = parseFormValues(formValues)
  const geometryValues = getGeometryValues(formValues)
  const error = formValidation.error ?? serviceError

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
      setRayGuidance(null)
      const fetchPreview = async () => {
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
            setRayGuidance(null)
            setServiceError(getErrorMessage(body) ?? PREVIEW_FAILED)
            setPreviewStatus('Preview unavailable.')
            return
          }

          if (!isPreviewResult(body)) {
            setRayGuidance(null)
            setServiceError(PREVIEW_FAILED)
            setPreviewStatus('Preview unavailable.')
            return
          }

          resultRef.current = body
          setResult(body)
          setRayGuidance({
            criticalAngleDeg: body.guidance.critical_angle_deg,
            modelId: body.guidance.model_manifest.model_id,
            modelVersion: body.guidance.model_manifest.model_version,
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

          setRayGuidance(null)
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
    setRayGuidance(null)
    setServiceError(null)
    setPreviewStatus('Preview scheduled…')
    setFormValues((current) => ({ ...current, [field]: value }))
  }

  const updatePreset = (preset: Preset) => {
    setRayGuidance(null)
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
    setRayGuidance(null)
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
          rayGuidance={rayGuidance}
        />
        {result && <Level1Preview result={result} />}
      </div>
    </main>
  )
}

export default App
