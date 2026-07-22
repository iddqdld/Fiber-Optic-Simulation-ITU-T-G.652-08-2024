import type { operations } from '../../../packages/shared_schemas/generated/api'

type PreviewResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']
type StandardsChecks = PreviewResult['standards_checks']
type AttenuationCheck = NonNullable<StandardsChecks['attenuation']>
type DispersionCheck = NonNullable<StandardsChecks['dispersion']>

type Level1PreviewProps = {
  result: PreviewResult
}

function isG652DStandardsChecks(
  value: StandardsChecks,
): value is StandardsChecks & {
  preset: 'g652d'
  attenuation: AttenuationCheck
  dispersion: DispersionCheck
} {
  return (
    value.preset === 'g652d' &&
    value.attenuation !== null &&
    value.dispersion !== null
  )
}

function formatModeRegime(
  value: PreviewResult['guidance']['mode_regime'],
): string {
  return value === 'single_mode' ? 'Single mode' : 'Multimode'
}

function formatCheckStatus(
  value: AttenuationCheck['status'] | DispersionCheck['status'],
): string {
  if (value === 'pass') {
    return 'Pass'
  }

  if (value === 'not_applicable') {
    return 'Not applicable'
  }

  return 'Fail'
}

function formatWarning(
  warning: PreviewResult['warnings'][number],
  result: PreviewResult,
): string {
  if (warning.code === 'mode_count_unavailable') {
    const vNumber = result.guidance.v_number_dimensionless
    const threshold =
      result.guidance.model_manifest.mode_count_min_v_dimensionless

    return `Approximate mode count is unavailable because the calculated V-number (${vNumber}) is below the model validity threshold of ${threshold}. V-number is derived from the refractive indices, core radius, and wavelength; it is not a separate input.`
  }

  if (warning.code === 'air_acceptance_angle_unavailable') {
    const numericalAperture = result.guidance.numerical_aperture_dimensionless

    return `Air acceptance angle is unavailable because the calculated numerical aperture (${numericalAperture}) exceeds the air-coupling limit of 1. Numerical aperture is derived from the core and cladding refractive indices; it is not a separate input.`
  }

  return warning.message
}

export function Level1Preview({ result }: Level1PreviewProps) {
  return (
    <section
      className="results-card"
      aria-labelledby="level1-preview-title"
      aria-label="Level 1 preview"
    >
      <h2 id="level1-preview-title">Level 1 preview</h2>
      <p className="model-note">
        This card is the numerical summary for one uniform fibre section;
        scientific plots are presented separately.
      </p>

      <dl className="results-grid">
        <div>
          <dt>Mode regime</dt>
          <dd>{formatModeRegime(result.guidance.mode_regime)}</dd>
        </div>
        <div>
          <dt>V-number</dt>
          <dd>
            <span>{result.guidance.v_number_dimensionless}</span>{' '}
            <span>dimensionless</span>
          </dd>
        </div>
        <div>
          <dt>Numerical aperture</dt>
          <dd>
            <span>{result.guidance.numerical_aperture_dimensionless}</span>{' '}
            <span>dimensionless</span>
          </dd>
        </div>
        <div>
          <dt>Section loss</dt>
          <dd>
            {result.attenuation.section_loss_db} <span>dB</span>
          </dd>
        </div>
        <div>
          <dt>Output power</dt>
          <dd>
            {result.bend_loss.output_power_dbm} <span>dBm</span>
          </dd>
        </div>
        <div>
          <dt>Group delay</dt>
          <dd>
            {result.group_delay.group_delay_ps} <span>ps</span>
          </dd>
        </div>
        <div>
          <dt>Input pulse FWHM</dt>
          <dd>
            {result.pulse_broadening.input_pulse_fwhm_ps} <span>ps</span>
          </dd>
        </div>
        <div>
          <dt>Output pulse FWHM</dt>
          <dd>
            {result.pulse_broadening.output_pulse_fwhm_ps} <span>ps</span>
          </dd>
        </div>
      </dl>

      <dl className="model-details">
        <div>
          <dt>Model id</dt>
          <dd>{result.model_manifest.model_id}</dd>
        </div>
        <div>
          <dt>Model version</dt>
          <dd>{result.model_manifest.model_version}</dd>
        </div>
        <div>
          <dt>Model status</dt>
          <dd>Approximate</dd>
        </div>
      </dl>

      <details className="model-scope-disclosure">
        <summary>Model assumptions and limitations</summary>
        <h3>Assumptions</h3>
        <ul>
          {result.model_manifest.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
        <h3>Limitations</h3>
        <ul>
          {result.model_manifest.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>

      {isG652DStandardsChecks(result.standards_checks) ? (
        <section
          className="standards-summary"
          aria-label="Standards status summary"
        >
          <h3>G.652.D status</h3>
          <p>
            Attenuation:{' '}
            {formatCheckStatus(result.standards_checks.attenuation.status)};{' '}
            Dispersion:{' '}
            {formatCheckStatus(result.standards_checks.dispersion.status)}.
          </p>
        </section>
      ) : (
        <p className="model-note">Custom fibre: standards checks are off.</p>
      )}

      <section className="warnings" aria-labelledby="warnings-title">
        <h3 id="warnings-title">Warnings</h3>
        {result.warnings.length > 0 ? (
          <ul>
            {result.warnings.map((warning) => (
              <li key={`${warning.code}-${warning.message}`}>
                {formatWarning(warning, result)}
              </li>
            ))}
          </ul>
        ) : (
          <p>No warnings.</p>
        )}
      </section>
    </section>
  )
}
