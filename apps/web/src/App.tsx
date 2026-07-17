import { type FormEvent, useEffect, useState } from 'react'

import type {
  components,
  operations,
} from '../../../packages/shared_schemas/generated/api'

type GuidanceRequest =
  operations['calculate_guidance']['requestBody']['content']['application/json']
type GuidanceResult =
  operations['calculate_guidance']['responses'][200]['content']['application/json']
type ErrorResponse = components['schemas']['ErrorResponse']

type FormValues = {
  n_core: string
  n_cladding: string
  core_radius_um: string
  wavelength_nm: string
}

const initialFormValues: FormValues = {
  n_core: '1.45',
  n_cladding: '1.444',
  core_radius_um: '4.1',
  wavelength_nm: '1550',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isGuidanceWarning(
  value: unknown,
): value is GuidanceResult['warnings'][number] {
  return (
    isRecord(value) &&
    (value.code === 'air_acceptance_angle_unavailable' ||
      value.code === 'mode_count_unavailable') &&
    typeof value.message === 'string' &&
    (value.output_field === 'air_acceptance_angle_deg' ||
      value.output_field === 'approximate_mode_count')
  )
}

function isGuidanceModelManifest(
  value: unknown,
): value is GuidanceResult['model_manifest'] {
  return (
    isRecord(value) &&
    value.model_id === 'ideal_circular_step_index_guidance' &&
    value.model_version === '1.0.0' &&
    isFiniteNumber(value.mode_regime_cutoff_v_dimensionless) &&
    isFiniteNumber(value.mode_count_min_v_dimensionless) &&
    isStringArray(value.assumptions) &&
    isStringArray(value.limitations)
  )
}

function isGuidanceResult(value: unknown): value is GuidanceResult {
  return (
    isRecord(value) &&
    isFiniteNumber(value.critical_angle_deg) &&
    isFiniteNumber(value.numerical_aperture_dimensionless) &&
    (value.air_acceptance_angle_deg === null ||
      isFiniteNumber(value.air_acceptance_angle_deg)) &&
    isFiniteNumber(value.relative_index_difference_dimensionless) &&
    isFiniteNumber(value.v_number_dimensionless) &&
    (value.mode_regime === 'single_mode' ||
      value.mode_regime === 'multimode') &&
    (value.approximate_mode_count === null ||
      isFiniteNumber(value.approximate_mode_count)) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isGuidanceWarning) &&
    isGuidanceModelManifest(value.model_manifest)
  )
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

function formatValue(value: number | null): string {
  return value === null ? 'Unavailable' : String(value)
}

function formatModeRegime(value: GuidanceResult['mode_regime']): string {
  return value === 'single_mode' ? 'Single mode' : 'Multimode'
}

function App() {
  const [backendStatus, setBackendStatus] = useState('Checking backend…')
  const [formValues, setFormValues] = useState(initialFormValues)
  const [result, setResult] = useState<GuidanceResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    const checkBackendHealth = async () => {
      try {
        const response = await fetch('/api/v1/health', {
          signal: controller.signal,
        })
        const data = (await response.json()) as { status?: string }

        if (response.ok && data.status === 'ok') {
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

    checkBackendHealth()

    return () => controller.abort()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setResult(null)

    const request: GuidanceRequest = {
      n_core: Number(formValues.n_core),
      n_cladding: Number(formValues.n_cladding),
      core_radius_um: Number(formValues.core_radius_um),
      wavelength_nm: Number(formValues.wavelength_nm),
    }

    if (
      !Object.values(request).every(
        (value) => isFiniteNumber(value) && value > 0,
      )
    ) {
      setError('Calculation failed. Enter valid numeric values.')
      return
    }

    setIsCalculating(true)

    try {
      const response = await fetch('/api/v1/guidance/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })
      const body: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        setError(getErrorMessage(body) ?? 'Calculation failed.')
        return
      }

      if (!isGuidanceResult(body)) {
        setError('Calculation failed.')
        return
      }

      setResult(body)
    } catch {
      setError('Unable to reach the calculation service.')
    } finally {
      setIsCalculating(false)
    }
  }

  const updateField = (field: keyof FormValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }))
  }

  return (
    <main>
      <h1>Optical Fibre Simulator</h1>
      <p>Calculate ideal step-index guidance quantities.</p>
      <p className="backend-status" role="status">
        {backendStatus}
      </p>

      <section
        className="calculator-card"
        aria-labelledby="guidance-calculator-title"
      >
        <h2 id="guidance-calculator-title">Guidance calculator</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label htmlFor="n-core">Core refractive index</label>
            <input
              id="n-core"
              name="n_core"
              type="number"
              min={Number.MIN_VALUE}
              step="any"
              required
              value={formValues.n_core}
              onChange={(event) => updateField('n_core', event.target.value)}
            />

            <label htmlFor="n-cladding">Cladding refractive index</label>
            <input
              id="n-cladding"
              name="n_cladding"
              type="number"
              min={Number.MIN_VALUE}
              step="any"
              required
              value={formValues.n_cladding}
              onChange={(event) =>
                updateField('n_cladding', event.target.value)
              }
            />

            <label htmlFor="core-radius">Core radius (µm)</label>
            <input
              id="core-radius"
              name="core_radius_um"
              type="number"
              min={Number.MIN_VALUE}
              step="any"
              required
              value={formValues.core_radius_um}
              onChange={(event) =>
                updateField('core_radius_um', event.target.value)
              }
            />

            <label htmlFor="wavelength">Wavelength (nm)</label>
            <input
              id="wavelength"
              name="wavelength_nm"
              type="number"
              min={Number.MIN_VALUE}
              step="any"
              required
              value={formValues.wavelength_nm}
              onChange={(event) =>
                updateField('wavelength_nm', event.target.value)
              }
            />
          </div>

          <button type="submit" disabled={isCalculating}>
            {isCalculating ? 'Calculating…' : 'Calculate guidance'}
          </button>
        </form>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>

      {result && (
        <section
          className="results-card"
          aria-labelledby="guidance-results-title"
        >
          <h2 id="guidance-results-title">Guidance results</h2>
          <p className="model-note">
            <strong>Approximate model</strong> — ideal circular step-index
            guidance calculations.
          </p>

          <dl className="results-grid">
            <div>
              <dt>Critical angle (°)</dt>
              <dd>{result.critical_angle_deg}</dd>
            </div>
            <div>
              <dt>Numerical aperture</dt>
              <dd>{result.numerical_aperture_dimensionless}</dd>
            </div>
            <div>
              <dt>Air acceptance angle (°)</dt>
              <dd>{formatValue(result.air_acceptance_angle_deg)}</dd>
            </div>
            <div>
              <dt>Relative index difference</dt>
              <dd>{result.relative_index_difference_dimensionless}</dd>
            </div>
            <div>
              <dt>V-number</dt>
              <dd>{result.v_number_dimensionless}</dd>
            </div>
            <div>
              <dt>Mode regime</dt>
              <dd>{formatModeRegime(result.mode_regime)}</dd>
            </div>
            <div>
              <dt>Approximate mode count</dt>
              <dd>{formatValue(result.approximate_mode_count)}</dd>
            </div>
          </dl>

          {result.warnings.length > 0 && (
            <section className="warnings" aria-labelledby="warnings-title">
              <h3 id="warnings-title">Warnings</h3>
              <ul>
                {result.warnings.map((warning) => (
                  <li key={`${warning.code}-${warning.output_field}`}>
                    {warning.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      )}
    </main>
  )
}

export default App
