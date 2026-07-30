import { M1FoundationCopy, PandaQualitativeNotice } from './M1Foundation'
import { getM1WorkspaceLabel, type M1WorkspaceId } from './M1WorkspaceCatalog'
import type {
  PandaFieldController,
  PandaFieldPresentationMode,
  PandaFieldResult,
} from './pandaFieldModel'
import type { PandaMeshController, PandaMeshResult } from './pandaMeshModel'

export type M1ResultsProps = {
  workspace: M1WorkspaceId
  pandaField?: PandaFieldController | null
  pandaMesh?: PandaMeshController | null
}

function formatScientific(value: number) {
  return value.toExponential(6)
}

const meshRegionLabels = {
  cladding: 'Cladding',
  core: 'Core',
  sap_1: 'SAP 1',
  sap_2: 'SAP 2',
} as const

const meshWarningLabels = {
  quality_below_target: 'Quality below target',
  polygonal_interface_approximation: 'Polygonal interface approximation',
} as const

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
  const coreAngle = result.core_principal_axis_angle_rad

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
  pandaMesh,
}: {
  workspace: M1WorkspaceId
  controller: PandaFieldController | null
  pandaMesh: PandaMeshController | null
}) {
  const isPandaField = workspace === 'panda-field'
  const calculation =
    (isPandaField ? controller?.phase : pandaMesh?.phase) === 'loading'
      ? 'In progress'
      : 'Not run'
  let note = 'Mesh-only geometry results are not available yet.'
  if (isPandaField) {
    note =
      controller?.phase === 'validation'
        ? 'Correct the highlighted inputs before calculating the qualitative field map.'
        : (controller?.errorMessage ??
          'A validated qualitative field result is not available in the current state.')
  }
  if (!isPandaField) {
    note =
      pandaMesh?.phase === 'validation'
        ? 'Correct the highlighted geometry inputs before generating the mesh.'
        : (pandaMesh?.errorMessage ??
          'A validated mesh-only result is not available in the current state.')
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

function MeshReadyResults({ result }: { result: PandaMeshResult }) {
  const manifest = result.model_manifest
  return (
    <>
      <p className="m1-inspector-status">
        Mesh-only result · no FEM fields solved
      </p>
      <dl className="m1-results-list">
        <div>
          <dt>Refinement</dt>
          <dd>{result.configuration.refinement_level}</dd>
        </div>
        <div>
          <dt>Nodes</dt>
          <dd>{result.node_count}</dd>
        </div>
        <div>
          <dt>Elements</dt>
          <dd>{result.element_count}</dd>
        </div>
        <div>
          <dt>Minimum angle</dt>
          <dd>{result.quality.minimum_angle_deg.toFixed(3)}°</dd>
        </div>
        <div>
          <dt>Minimum normalized quality</dt>
          <dd>{result.quality.minimum_normalized_quality.toFixed(6)}</dd>
        </div>
        <div>
          <dt>Mean normalized quality</dt>
          <dd>{result.quality.mean_normalized_quality.toFixed(6)}</dd>
        </div>
        <div>
          <dt>Generator</dt>
          <dd>{manifest.generator_version}</dd>
        </div>
        <div>
          <dt>FEM compatibility</dt>
          <dd>{manifest.fem_compatibility_version}</dd>
        </div>
      </dl>

      <section
        className="m1-result-section"
        aria-labelledby="m1-mesh-region-title"
      >
        <h3 id="m1-mesh-region-title">Mesh-only region summaries</h3>
        <ul>
          {result.region_summaries.map((summary) => (
            <li key={summary.region}>
              <strong>{meshRegionLabels[summary.region]}</strong>:{' '}
              {summary.element_count} elements · target area{' '}
              {formatScientific(summary.target_area_m2)} m² · total area{' '}
              {formatScientific(summary.total_area_m2)} m²
            </li>
          ))}
        </ul>
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-mesh-warning-title"
      >
        <h3 id="m1-mesh-warning-title">Mesh warnings</h3>
        {result.warnings.length === 0 ? (
          <p className="m1-results-note">No mesh warnings.</p>
        ) : (
          <ul>
            {result.warnings.map((warning) => (
              <li
                key={`${warning.code}-${warning.message}`}
                className="m1-results-warning"
              >
                <strong>{meshWarningLabels[warning.code]}</strong>:{' '}
                {warning.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-mesh-assumption-title"
      >
        <h3 id="m1-mesh-assumption-title">Mesh assumptions</h3>
        <ul>
          {manifest.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-mesh-limitation-title"
      >
        <h3 id="m1-mesh-limitation-title">Mesh limitations</h3>
        <ul>
          {manifest.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>
    </>
  )
}

export function M1Results({
  workspace,
  pandaField = null,
  pandaMesh = null,
}: M1ResultsProps) {
  const readyResult =
    workspace === 'panda-field' && pandaField?.phase === 'ready'
      ? pandaField.result
      : null
  const meshResult =
    workspace === 'fem-mesh' && pandaMesh?.phase === 'ready'
      ? pandaMesh.result
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
      ) : meshResult ? (
        <MeshReadyResults result={meshResult} />
      ) : (
        <UnavailableResults
          workspace={workspace}
          controller={pandaField}
          pandaMesh={pandaMesh}
        />
      )}
    </section>
  )
}
