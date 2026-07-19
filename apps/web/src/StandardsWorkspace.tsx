import type { ReactNode } from 'react'

import type { operations } from '../../../packages/shared_schemas/generated/api'

type PreviewResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']
type StandardsChecks = PreviewResult['standards_checks']
type AttenuationCheck = NonNullable<StandardsChecks['attenuation']>
type DispersionCheck = NonNullable<StandardsChecks['dispersion']>
type CheckState = 'pass' | 'fail' | 'not-applicable'

type StandardsWorkspaceProps = {
  standardsChecks: StandardsChecks | null
}

function attenuationState(status: AttenuationCheck['status']): CheckState {
  if (status === 'pass') {
    return 'pass'
  }

  if (status === 'not_applicable') {
    return 'not-applicable'
  }

  return 'fail'
}

function dispersionState(status: DispersionCheck['status']): CheckState {
  return status === 'pass' ? 'pass' : 'fail'
}

function stateLabel(state: CheckState): string {
  if (state === 'not-applicable') {
    return 'Not applicable'
  }

  return state === 'pass' ? 'Pass' : 'Fail'
}

function StandardsCheck({
  title,
  state,
  children,
}: {
  title: string
  state: CheckState
  children: ReactNode
}) {
  return (
    <article className="standards-check" data-state={state}>
      <header>
        <h2>{title}</h2>
        <span className="standards-state">
          <span aria-hidden="true">{state === 'pass' ? '✓' : '!'}</span>{' '}
          {stateLabel(state)}
        </span>
      </header>
      {children}
    </article>
  )
}

function CustomStandards() {
  return (
    <div className="standards-check-grid">
      <StandardsCheck title="Attenuation" state="not-applicable">
        <p>
          Select the G.652.D preset to compare attenuation with represented
          standard-cable limits.
        </p>
      </StandardsCheck>
      <StandardsCheck title="Chromatic dispersion" state="not-applicable">
        <p>
          Select the G.652.D preset to compare the supplied coefficient with the
          represented wavelength envelope.
        </p>
      </StandardsCheck>
    </div>
  )
}

export function StandardsWorkspace({
  standardsChecks,
}: StandardsWorkspaceProps) {
  const preset = standardsChecks?.preset ?? 'custom'
  const presetDefinition = standardsChecks?.preset_definition ?? null
  const attenuation = standardsChecks?.attenuation ?? null
  const dispersion = standardsChecks?.dispersion ?? null
  const isG652D =
    preset === 'g652d' &&
    presetDefinition !== null &&
    attenuation !== null &&
    dispersion !== null

  return (
    <section className="standards-workspace" aria-labelledby="standards-title">
      <header className="workspace-options-bar">
        <div>
          <p className="workspace-kicker">Represented checks</p>
          <h2 id="standards-title">Standards</h2>
          <p>
            {isG652D
              ? `${presetDefinition.standard_name} ${presetDefinition.fibre_category}, edition ${presetDefinition.standard_edition}`
              : 'Custom fibre · standards checks are not applicable'}
          </p>
        </div>
        <span className="standards-preset-badge">
          {isG652D ? 'G.652.D' : 'Custom'}
        </span>
      </header>

      {!isG652D ? (
        <CustomStandards />
      ) : (
        <>
          <div className="standards-check-grid">
            <StandardsCheck
              title="Attenuation"
              state={attenuationState(attenuation.status)}
            >
              <dl className="standards-values">
                <div>
                  <dt>Supplied</dt>
                  <dd>{attenuation.supplied_attenuation_db_per_km} dB/km</dd>
                </div>
                <div>
                  <dt>Maximum</dt>
                  <dd>
                    {attenuation.maximum_attenuation_db_per_km === null
                      ? 'Not applicable'
                      : `${attenuation.maximum_attenuation_db_per_km} dB/km`}
                  </dd>
                </div>
                <div>
                  <dt>Wavelength</dt>
                  <dd>{attenuation.wavelength_nm} nm</dd>
                </div>
                <div>
                  <dt>Cable context</dt>
                  <dd>{attenuation.cable_application.replaceAll('_', ' ')}</dd>
                </div>
              </dl>
              {attenuation.not_applicable_reason !== null && (
                <p className="standards-reason">
                  {attenuation.not_applicable_reason}
                </p>
              )}
              <p className="standards-model">
                {attenuation.model_manifest.model_id} ·{' '}
                {attenuation.model_manifest.model_version}
              </p>
            </StandardsCheck>

            <StandardsCheck
              title="Chromatic dispersion"
              state={dispersionState(dispersion.status)}
            >
              <dl className="standards-values">
                <div>
                  <dt>Supplied</dt>
                  <dd>
                    {dispersion.supplied_dispersion_ps_per_nm_km} ps/(nm·km)
                  </dd>
                </div>
                <div>
                  <dt>Envelope</dt>
                  <dd>
                    {dispersion.minimum_dispersion_ps_per_nm_km}–
                    {dispersion.maximum_dispersion_ps_per_nm_km} ps/(nm·km)
                  </dd>
                </div>
                <div>
                  <dt>Wavelength</dt>
                  <dd>{dispersion.wavelength_nm} nm</dd>
                </div>
                <div>
                  <dt>Fit region</dt>
                  <dd>{dispersion.fit_region.replaceAll('_', ' ')}</dd>
                </div>
              </dl>
              <p className="standards-model">
                {dispersion.model_manifest.model_id} ·{' '}
                {dispersion.model_manifest.model_version}
              </p>
            </StandardsCheck>
          </div>

          <section
            className="standards-provenance"
            aria-labelledby="standards-sources-title"
          >
            <h2 id="standards-sources-title">Sources and limitations</h2>
            <ul>
              {presetDefinition.source_references.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
            <p>
              These represented attribute checks are not a complete product
              conformance determination.
            </p>
            <details>
              <summary>Preset limitations</summary>
              <ul>
                {presetDefinition.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </details>
          </section>
        </>
      )}
    </section>
  )
}
