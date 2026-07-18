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

export function Level1Preview({ result }: Level1PreviewProps) {
  return (
    <section
      className="results-card"
      aria-labelledby="level1-preview-title"
      aria-label="Level 1 preview"
    >
      <h2 id="level1-preview-title">Level 1 preview</h2>
      <p className="model-note">
        One uniform fibre section; plots and detailed standards information are
        outside this preview.
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
            {result.attenuation.output_power_dbm} <span>dBm</span>
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
      </dl>

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
                {warning.message}
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
