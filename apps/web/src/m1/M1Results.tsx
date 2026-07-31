import { M1FoundationCopy, PandaQualitativeNotice } from './M1Foundation'
import { getM1WorkspaceLabel, type M1WorkspaceId } from './M1WorkspaceCatalog'
import type {
  PandaFieldController,
  PandaFieldPresentationMode,
  PandaFieldResult,
} from './pandaFieldModel'
import type {
  PandaThermalFemController,
  PandaThermalFemResult,
} from './pandaThermalFemModel'

export type M1ResultsProps = {
  workspace: M1WorkspaceId
  pandaField?: PandaFieldController | null
  thermalFem?: PandaThermalFemController | null
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
  thermalFem,
}: {
  workspace: M1WorkspaceId
  controller: PandaFieldController | null
  thermalFem: PandaThermalFemController | null
}) {
  const isPandaField = workspace === 'panda-field'
  const calculation =
    (isPandaField ? controller?.phase : thermalFem?.phase) === 'loading'
      ? 'In progress'
      : 'Not run'
  let note = 'Quantitative thermoelastic FEM results are not available yet.'
  if (isPandaField) {
    note =
      controller?.phase === 'validation'
        ? 'Correct the highlighted inputs before calculating the qualitative field map.'
        : (controller?.errorMessage ??
          'A validated qualitative field result is not available in the current state.')
  }
  if (!isPandaField) {
    note =
      thermalFem?.phase === 'validation'
        ? 'Correct the highlighted inputs before calculating the thermoelastic FEM result.'
        : (thermalFem?.errorMessage ??
          'A validated quantitative thermoelastic FEM result is not available in the current state.')
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

function formatMpa(value: number) {
  return `${(value / 1e6).toFixed(6)} MPa`
}

function formatDeltaN(value: number) {
  return `${value.toExponential(6)} Δn`
}

function formatCoefficient(value: number) {
  return `${value.toExponential(6)} Pa⁻¹`
}

function formatAngle(value: number | null) {
  return value === null
    ? 'Undefined for zero local splitting'
    : `${((value * 180) / Math.PI).toFixed(3)}° from +x`
}

const axialConditionLabels = {
  free_resultant: 'Free axial resultant (Nᶻ = 0)',
  prescribed_force: 'Prescribed axial force',
  prescribed_strain: 'Prescribed axial strain',
} as const

const thermalFemWarningLabels = {
  demonstration_data: 'Demonstration data',
  convergence_unavailable: 'Convergence unavailable',
  convergence_above_threshold: 'Convergence above threshold',
  local_material_birefringence_convergence_above_threshold:
    'Local material birefringence convergence above threshold',
  pressure_phase_birefringence_convergence_above_threshold:
    'Pressure phase-birefringence convergence above threshold',
} as const

const meshWarningLabels = {
  quality_below_target: 'Mesh quality below target',
  polygonal_interface_approximation: 'Polygonal interface approximation',
} as const

const comparisonUnavailableLabels = {
  insufficient_core_elements: 'Fewer than two core-element samples',
  zero_or_nonfinite_scale: 'Zero or non-finite normalization scale',
  nonfinite_metric: 'A comparison metric was non-finite',
} as const

function formatBeatLength(
  estimate: PandaThermalFemResult['optical_birefringence']['pressure_induced'],
) {
  return estimate.beat_length_m === null
    ? 'undefined within numerical tolerance'
    : `${estimate.beat_length_m.toExponential(6)} m`
}

function formatModalAxis(value: number | null) {
  return value === null
    ? 'Undefined within numerical tolerance'
    : `${((value * 180) / Math.PI).toFixed(3)}° from +x`
}

function ModalEstimateSection({
  id,
  title,
  estimate,
}: {
  id: string
  title: string
  estimate: PandaThermalFemResult['optical_birefringence']['pressure_induced']
}) {
  return (
    <section className="m1-result-section" aria-labelledby={id}>
      <h4 id={id}>{title}</h4>
      <dl className="m1-results-list">
        <div>
          <dt>Signed Bph estimate</dt>
          <dd>{formatDeltaN(estimate.signed_phase_birefringence)}</dd>
        </div>
        <div>
          <dt>|Bph estimate|</dt>
          <dd>{formatDeltaN(estimate.phase_birefringence_magnitude)}</dd>
        </div>
        <div>
          <dt>Signed Δβ</dt>
          <dd>{formatScientific(estimate.signed_delta_beta_per_m)} m⁻¹</dd>
        </div>
        <div>
          <dt>Estimated beat length</dt>
          <dd>{formatBeatLength(estimate)}</dd>
        </div>
        <div>
          <dt>Common index shift</dt>
          <dd>{formatScientific(estimate.common_index_shift)} Δn</dd>
        </div>
        <div>
          <dt>State 1 index shift / axis</dt>
          <dd>
            {formatScientific(estimate.state_1_index_shift)} Δn ·{' '}
            {formatModalAxis(estimate.state_1_axis_angle_rad)}
          </dd>
        </div>
        <div>
          <dt>State 2 index shift / axis</dt>
          <dd>
            {formatScientific(estimate.state_2_index_shift)} Δn ·{' '}
            {formatModalAxis(estimate.state_2_axis_angle_rad)}
          </dd>
        </div>
        <div>
          <dt>Slow axis</dt>
          <dd>{formatModalAxis(estimate.slow_axis_angle_rad)}</dd>
        </div>
      </dl>
    </section>
  )
}

function ThermalFemReadyResults({ result }: { result: PandaThermalFemResult }) {
  const manifest = result.model_manifest
  const axialLoad = result.configuration.axial_load
  const core = result.core_summary
  const pressureCore = result.pressure_increment_core_summary
  const forceBalance = result.force_balance
  const latestConvergence = result.convergence.at(-1)
  const comparison = result.qualitative_kernel_fem_shape_comparison
  const optical = result.optical_birefringence
  const torsion = result.torsion
  const opticalMode = result.configuration.optical_mode!
  return (
    <>
      <p className="m1-inspector-status">
        Quantitative mechanical FEM and Step 2.8 scalar optical estimate
      </p>
      <dl className="m1-results-list">
        <div>
          <dt>Method</dt>
          <dd>Generalized-plane-strain thermoelastic FEM</dd>
        </div>
        <div>
          <dt>Axial mode</dt>
          <dd>{axialConditionLabels[axialLoad.condition]}</dd>
        </div>
        <div>
          <dt>Uniform axial strain εzz⁰</dt>
          <dd>{result.epsilon_zz_0.toExponential(6)} (strain unit 1)</dd>
        </div>
        <div>
          <dt>Lateral pressure</dt>
          <dd>
            {(result.configuration.lateral_pressure_pa / 1e6).toFixed(6)} MPa
          </dd>
        </div>
        <div>
          <dt>Optical mode</dt>
          <dd>
            {(opticalMode.wavelength_m * 1e9).toFixed(3)} nm ·{' '}
            {(opticalMode.gaussian_mode_field_radius_m * 1e6).toFixed(3)} µm
          </dd>
        </div>
        <div>
          <dt>Core average σxx / σyy</dt>
          <dd>
            {formatMpa(core.average_stress_xx_pa)} /{' '}
            {formatMpa(core.average_stress_yy_pa)}
          </dd>
        </div>
        <div>
          <dt>Core average σzz / σxy</dt>
          <dd>
            {formatMpa(core.average_stress_zz_pa)} /{' '}
            {formatMpa(core.average_stress_xy_pa)}
          </dd>
        </div>
        <div>
          <dt>Core principal difference</dt>
          <dd>{formatMpa(core.principal_difference_pa)}</dd>
        </div>
        <div>
          <dt>Core stress-optic coefficient</dt>
          <dd>{formatCoefficient(core.stress_optic_coefficient_per_pa)}</dd>
        </div>
        <div>
          <dt>Core local material birefringence</dt>
          <dd>
            signed {formatDeltaN(core.signed_local_material_birefringence)} ·
            magnitude {formatDeltaN(core.local_material_birefringence)} · axis{' '}
            {formatAngle(core.local_material_slow_axis_angle_rad)}
          </dd>
        </div>
        <div>
          <dt>Mesh</dt>
          <dd>
            {result.mesh.node_count.toLocaleString()} nodes ·{' '}
            {result.mesh.element_count.toLocaleString()} elements · level{' '}
            {result.configuration.refinement_level}
          </dd>
        </div>
      </dl>

      <section
        className="m1-result-section"
        aria-labelledby="m1-fem-optical-title"
      >
        <h3 id="m1-fem-optical-title">{optical.method}</h3>
        <p className="m1-results-note">
          This is a first-order scalar weak-guidance estimate in the degenerate
          Gaussian LP₀₁ polarization basis. It is not a validated vector-mode
          solution. Moving-boundary and deformed-waveguide contributions are not
          included. The signed value is state 1 minus state 2; state 1 is the
          unoriented eigenaxis closest to global +x.
        </p>
        <ModalEstimateSection
          id="m1-fem-zero-pressure-title"
          title="Zero-pressure residual PANDA"
          estimate={optical.zero_pressure_residual}
        />
        <ModalEstimateSection
          id="m1-fem-total-optical-title"
          title="Total combined PANDA"
          estimate={optical.total_combined}
        />
        <ModalEstimateSection
          id="m1-fem-pressure-optical-title"
          title="Pressure-induced change"
          estimate={optical.pressure_induced}
        />
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-fem-group-title"
      >
        <h3 id="m1-fem-group-title">Group birefringence</h3>
        <p className="m1-results-note">
          Unavailable because the current result has only one wavelength.
          Required inputs are:
        </p>
        <ul>
          {optical.group_birefringence.requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-fem-pressure-title"
      >
        <h3 id="m1-fem-pressure-title">Pressure increment Δσ = σ(P) − σ(0)</h3>
        <p className="m1-results-note">
          The pressure optical estimate uses only this incremental field, so the
          existing PANDA residual thermal stress is not counted twice.
        </p>
        <dl className="m1-results-list">
          <div>
            <dt>Core Δσxx / Δσyy</dt>
            <dd>
              {formatMpa(pressureCore.average_stress_xx_pa)} /{' '}
              {formatMpa(pressureCore.average_stress_yy_pa)}
            </dd>
          </div>
          <div>
            <dt>Core Δσzz / Δσxy</dt>
            <dd>
              {formatMpa(pressureCore.average_stress_zz_pa)} /{' '}
              {formatMpa(pressureCore.average_stress_xy_pa)}
            </dd>
          </div>
          <div>
            <dt>Core increment principal difference</dt>
            <dd>{formatMpa(pressureCore.principal_difference_pa)}</dd>
          </div>
        </dl>
        <p className="m1-results-note">
          Positive compression acts directly on the bare/uncoated outer glass.
          Coating mechanics, support contact, and packaging load transfer are
          outside the model. Free Nᶻ = 0 applies only when the fibre ends are
          not pressure-loaded; true hydrostatic end-face pressure needs another
          axial loading condition.
        </p>
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-fem-force-title"
      >
        <h3 id="m1-fem-force-title">Force balance</h3>
        <ul>
          <li>
            Transverse residual:{' '}
            {formatScientific(forceBalance.transverse_free_residual_l2_n_per_m)}{' '}
            N/m
          </li>
          <li>
            Transverse resultant:{' '}
            {formatScientific(forceBalance.transverse_resultant_x_n_per_m)} /{' '}
            {formatScientific(forceBalance.transverse_resultant_y_n_per_m)} N/m
          </li>
          <li>
            Axial resultant: {formatScientific(forceBalance.axial_resultant_n)}{' '}
            N
          </li>
          <li>
            Axial target:{' '}
            {axialLoad.condition === 'prescribed_strain'
              ? 'Not imposed for prescribed strain'
              : `${formatScientific(forceBalance.axial_target_n ?? 0)} N`}
          </li>
          <li>
            Axial residual:{' '}
            {axialLoad.condition === 'prescribed_strain'
              ? 'Not imposed for prescribed strain'
              : `${formatScientific(forceBalance.axial_residual_n ?? 0)} N`}
          </li>
        </ul>
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-fem-convergence-title"
      >
        <h3 id="m1-fem-convergence-title">
          Mechanical and pressure convergence
        </h3>
        <ul>
          {result.convergence.map((entry) => (
            <li key={entry.refinement_level}>
              Level {entry.refinement_level}:{' '}
              {entry.node_count.toLocaleString()} nodes ·{' '}
              {entry.element_count.toLocaleString()} elements · mechanical
              change{' '}
              {entry.relative_change === null
                ? 'unavailable'
                : `${(entry.relative_change * 100).toFixed(2)}%`}{' '}
              · local Δn{' '}
              {formatDeltaN(entry.core_average_local_material_birefringence)} ·
              local change{' '}
              {entry.local_material_birefringence_relative_change === null
                ? 'unavailable'
                : `${(entry.local_material_birefringence_relative_change * 100).toFixed(2)}%`}{' '}
              · pressure Bph{' '}
              {formatDeltaN(entry.pressure_induced_phase_birefringence)} ·
              pressure change{' '}
              {entry.pressure_induced_phase_birefringence_relative_change ===
              null
                ? 'unavailable'
                : `${(entry.pressure_induced_phase_birefringence_relative_change * 100).toFixed(2)}%`}{' '}
              · {entry.pressure_induced_phase_birefringence_status}
            </li>
          ))}
        </ul>
        {latestConvergence && (
          <p className="m1-results-note">
            Latest mechanical status: {latestConvergence.status}.
          </p>
        )}
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-fem-torsion-title"
      >
        <h3 id="m1-fem-torsion-title">
          Analytical Saint-Venant torsion benchmark only
        </h3>
        <p className="m1-results-note">
          This is not heterogeneous PANDA torsion. It is not used in the
          transverse scalar optical model, and no torsion-induced polarization
          coupling is inferred.
        </p>
        <dl className="m1-results-list">
          <div>
            <dt>Capability</dt>
            <dd>
              {torsion.capability === 'none'
                ? 'None'
                : 'Saint-Venant homogeneous circular reference'}
            </dd>
          </div>
          <div>
            <dt>Input</dt>
            <dd>
              {torsion.input_mode === null
                ? 'None'
                : torsion.input_mode === 'twist_rate'
                  ? `Twist rate: ${torsion.twist_rate_per_m.toExponential(6)} 1/m`
                  : `Applied torque: ${torsion.applied_torque_n_m.toExponential(6)} N·m`}
            </dd>
          </div>
          <div>
            <dt>Torque / twist rate</dt>
            <dd>
              {torsion.applied_torque_n_m.toExponential(6)} N·m /{' '}
              {torsion.twist_rate_per_m.toExponential(6)} 1/m
            </dd>
          </div>
          <div>
            <dt>G / J / reference radius</dt>
            <dd>
              {torsion.shear_modulus_pa.toExponential(6)} Pa /{' '}
              {torsion.polar_moment_m4.toExponential(6)} m⁴ /{' '}
              {torsion.reference_radius_m.toExponential(6)} m
            </dd>
          </div>
          <div>
            <dt>Maximum boundary shear</dt>
            <dd>{formatMpa(torsion.maximum_boundary_shear_pa)}</dd>
          </div>
        </dl>
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-fem-comparison-title"
      >
        <h3 id="m1-fem-comparison-title">Figure 5.1 shape comparison</h3>
        <p className="m1-results-note">
          Normalized qualitative comparison of the Figure 5.1 kernel and FEM
          signed σxx − σyy at core-element centroids. It is not a stress,
          Eshelby, or birefringence error.
        </p>
        <dl className="m1-results-list">
          <div>
            <dt>Status</dt>
            <dd>{comparison.available ? 'Available' : 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Samples</dt>
            <dd>{comparison.sample_count.toLocaleString()} core elements</dd>
          </div>
          {comparison.available ? (
            <>
              <div>
                <dt>RMSE</dt>
                <dd>{comparison.rmse?.toFixed(6) ?? 'Undefined'}</dd>
              </div>
              <div>
                <dt>Correlation</dt>
                <dd>{comparison.correlation?.toFixed(6) ?? 'Undefined'}</dd>
              </div>
              <div>
                <dt>Sign agreement</dt>
                <dd>
                  {comparison.sign_agreement === null
                    ? 'Undefined'
                    : `${(comparison.sign_agreement * 100).toFixed(2)}%`}
                </dd>
              </div>
              <div>
                <dt>Fitted kernel polarity</dt>
                <dd>{comparison.best_polarity === 1 ? '+1' : '−1'}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Reason</dt>
              <dd>
                {comparison.unavailable_reason === null
                  ? 'Not reported'
                  : comparisonUnavailableLabels[comparison.unavailable_reason]}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-fem-quality-title"
      >
        <h3 id="m1-fem-quality-title">Mesh quality and units</h3>
        <ul>
          <li>
            Minimum angle: {result.mesh.quality.minimum_angle_deg.toFixed(3)}°
          </li>
          <li>
            Normalized quality:{' '}
            {result.mesh.quality.minimum_normalized_quality.toFixed(6)} minimum
            · {result.mesh.quality.mean_normalized_quality.toFixed(6)} mean
          </li>
          <li>
            API units: stress Pa, displacement m, strain 1, and birefringence
            dimensionless Δn. Display conversions: MPa = Pa × 1e−6 and µm = m ×
            1e6.
          </li>
        </ul>
      </section>

      <section
        className="m1-result-section"
        aria-labelledby="m1-fem-warning-title"
      >
        <h3 id="m1-fem-warning-title">Warnings</h3>
        {result.warnings.length === 0 ? (
          <p className="m1-results-note">No FEM warnings.</p>
        ) : (
          <ul>
            {result.warnings.map((warning) => (
              <li
                key={`${warning.code}-${warning.message}`}
                className="m1-results-warning"
              >
                <strong>{thermalFemWarningLabels[warning.code]}</strong>:{' '}
                {warning.message}
              </li>
            ))}
          </ul>
        )}
        {result.mesh.warnings.length > 0 && (
          <ul>
            {result.mesh.warnings.map((warning) => (
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
        aria-labelledby="m1-fem-assumption-title"
      >
        <h3 id="m1-fem-assumption-title">Assumptions and limitations</h3>
        <ul>
          {manifest.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
          {manifest.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
        <p className="m1-results-note">
          The local material birefringence remains separate from the total and
          pressure-induced scalar phase estimates above.
        </p>
      </section>
    </>
  )
}

export function M1Results({
  workspace,
  pandaField = null,
  thermalFem = null,
}: M1ResultsProps) {
  const readyResult =
    workspace === 'panda-field' && pandaField?.phase === 'ready'
      ? pandaField.result
      : null
  const thermalFemResult =
    workspace === 'fem-mesh' && thermalFem?.phase === 'ready'
      ? thermalFem.result
      : null

  return (
    <section
      className="m1-results"
      aria-labelledby="m1-results-title"
      data-m1-results={workspace}
    >
      <h2 id="m1-results-title">
        {workspace === 'fem-mesh'
          ? 'Thermoelastic FEM results'
          : `${getM1WorkspaceLabel(workspace)} results`}
      </h2>
      {readyResult ? (
        <PandaReadyResults
          result={readyResult}
          presentationMode={pandaField?.presentationMode ?? 'validity_aware'}
        />
      ) : thermalFemResult ? (
        <ThermalFemReadyResults result={thermalFemResult} />
      ) : (
        <UnavailableResults
          workspace={workspace}
          controller={pandaField}
          thermalFem={thermalFem}
        />
      )}
    </section>
  )
}
