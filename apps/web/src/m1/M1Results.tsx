import { M1FoundationCopy, PandaQualitativeNotice } from './M1Foundation'
import { getM1WorkspaceLabel, type M1WorkspaceId } from './M1WorkspaceCatalog'
import type {
  PandaFieldController,
  PandaFieldPresentationMode,
  PandaFieldResult,
} from './pandaFieldModel'
import { corePrincipalAxisAngle } from './pandaFieldView'

export type M1ResultsProps = {
  workspace: M1WorkspaceId
  pandaField?: PandaFieldController | null
}

function formatScientific(value: number) {
  return value.toExponential(6)
}

const warningLabels = {
  qualitative_uncalibrated: 'Qualitative only',
  finite_cladding_approximation: 'Finite-cladding approximation',
  zero_interface_buffer: 'No interface buffer',
} as const

function PandaReadyResults({
  result,
  presentationMode,
}: {
  result: PandaFieldResult
  presentationMode: PandaFieldPresentationMode
}) {
  const manifest = result.model_manifest
  const gridPoints = result.configuration.sampling.grid_points
  const interfaceBufferUm = manifest.validity.interface_buffer_m * 1e6
  const coreAngle = corePrincipalAxisAngle(result)

  return (
    <>
      <PandaQualitativeNotice />
      <dl className="m1-results-list">
        <div>
          <dt>Method</dt>
          <dd>Qualitative far-field kernel</dd>
        </div>
        <div>
          <dt>Model version</dt>
          <dd>{manifest.model_version}</dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>Normalized dimensionless kernel</dd>
        </div>
        <div>
          <dt>Units</dt>
          <dd>{manifest.units} — dimensionless</dd>
        </div>
        <div>
          <dt>Normalization</dt>
          <dd>Maximum valid absolute deviatoric difference</dd>
        </div>
        <div>
          <dt>Kernel scale</dt>
          <dd>{formatScientific(result.kernel_scale)}</dd>
        </div>
        <div>
          <dt>Grid resolution</dt>
          <dd>
            {gridPoints} × {gridPoints}
          </dd>
        </div>
        <div>
          <dt>Interface buffer</dt>
          <dd>
            {interfaceBufferUm.toFixed(3)} µm applied
            {presentationMode === 'reference_replica'
              ? ' · reference replica'
              : ' · validity-aware'}
          </dd>
        </div>
        <div>
          <dt>Valid points</dt>
          <dd>{manifest.validity.valid_point_count}</dd>
        </div>
        <div>
          <dt>SAP 1 mismatch strain</dt>
          <dd>{formatScientific(result.sap_thermal_mismatch_strains[0])}</dd>
        </div>
        <div>
          <dt>SAP 2 mismatch strain</dt>
          <dd>{formatScientific(result.sap_thermal_mismatch_strains[1])}</dd>
        </div>
        <div>
          <dt>Core principal-axis angle</dt>
          <dd>
            {coreAngle === null
              ? 'Undefined at nearest valid sample'
              : `${((coreAngle * 180) / Math.PI).toFixed(3)}° from +x`}
          </dd>
        </div>
      </dl>

      <section className="m1-result-section" aria-labelledby="m1-warning-title">
        <h3 id="m1-warning-title">Backend warnings</h3>
        {result.warnings.length === 0 ? (
          <p className="m1-results-note">No backend warnings.</p>
        ) : (
          <ul>
            {result.warnings.map((warning) => (
              <li
                key={`${warning.code}-${warning.output_field}`}
                className="m1-results-warning"
              >
                <strong>{warningLabels[warning.code]}</strong>:{' '}
                {warning.message} ({warning.output_field})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-assumption-title"
      >
        <h3 id="m1-assumption-title">Assumptions</h3>
        <ul>
          {manifest.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-limitation-title"
      >
        <h3 id="m1-limitation-title">Limitations</h3>
        <ul>
          {manifest.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>
    </>
  )
}

function UnavailableResults({
  workspace,
  controller,
}: {
  workspace: M1WorkspaceId
  controller: PandaFieldController | null
}) {
  const isPandaField = workspace === 'panda-field'
  const calculation =
    controller?.phase === 'loading' ? 'In progress' : 'Not run'
  let note = 'FEM mesh and validation results are not connected yet.'
  if (isPandaField) {
    note =
      controller?.phase === 'validation'
        ? 'Correct the highlighted inputs before calculating the qualitative field map.'
        : (controller?.errorMessage ??
          'A validated qualitative field result is not available in the current state.')
  }

  return (
    <>
      <M1FoundationCopy />
      <dl className="m1-results-list">
        <div>
          <dt>Calculation</dt>
          <dd>{calculation}</dd>
        </div>
        <div>
          <dt>Quality status</dt>
          <dd>Unavailable</dd>
        </div>
        <div>
          <dt>M1 warnings</dt>
          <dd>Unavailable</dd>
        </div>
      </dl>
      <p className="m1-results-note">{note}</p>
    </>
  )
}

export function M1Results({ workspace, pandaField = null }: M1ResultsProps) {
  const readyResult =
    workspace === 'panda-field' && pandaField?.phase === 'ready'
      ? pandaField.result
      : null

  return (
    <section
      className="m1-results"
      aria-labelledby="m1-results-title"
      data-m1-results={workspace}
    >
      <h2 id="m1-results-title">{getM1WorkspaceLabel(workspace)} results</h2>
      {readyResult ? (
        <PandaReadyResults
          result={readyResult}
          presentationMode={pandaField?.presentationMode ?? 'validity_aware'}
        />
      ) : (
        <UnavailableResults workspace={workspace} controller={pandaField} />
      )}
    </section>
  )
}
