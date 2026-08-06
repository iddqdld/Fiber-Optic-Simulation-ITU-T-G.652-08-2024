import { M1FoundationCopy, PandaQualitativeNotice } from './M1Foundation'
import type { M1WorkspaceId } from './M1WorkspaceCatalog'
import { PandaFieldCanvas } from './PandaFieldCanvas'
import type { PandaFieldController } from './pandaFieldModel'
import { PandaMeshCanvas } from './PandaMeshCanvas'
import type { PandaMeshController } from './pandaMeshModel'
import { PandaThermalFemCanvas } from './PandaThermalFemCanvas'
import type { PandaThermalFemController } from './pandaThermalFemModel'

export type M1WorkspaceProps = {
  workspace: M1WorkspaceId
  pandaField?: PandaFieldController | null
  pandaMesh?: PandaMeshController | null
  thermalFem?: PandaThermalFemController | null
}

function PandaFieldStatus({
  controller,
}: {
  controller: PandaFieldController | null
}) {
  if (controller?.phase === 'ready' && controller.result) {
    return (
      <PandaFieldCanvas
        result={controller.result}
        presentationMode={controller.presentationMode}
        showReferenceSpokes={controller.showReferenceSpokes}
      />
    )
  }

  let message = 'Configure the PANDA field inputs to calculate Figure 5.1.'
  if (controller?.phase === 'loading') {
    message = 'Calculating the normalized qualitative PANDA field map…'
  } else if (controller?.phase === 'validation') {
    message =
      'The PANDA field map is unavailable until the highlighted inputs are valid.'
  } else if (controller?.phase === 'error') {
    message =
      controller.errorMessage ??
      'The PANDA field-map service could not complete this calculation.'
  } else if (controller?.phase === 'ready') {
    message = 'The PANDA field result is unavailable.'
  }

  return (
    <div className="m1-workspace-placeholder" role="status" aria-live="polite">
      <p>{message}</p>
      <p>No stale field map is displayed in this state.</p>
    </div>
  )
}

function PandaFieldWorkspace({
  controller,
}: {
  controller: PandaFieldController | null
}) {
  return (
    <section
      className="m1-workspace"
      aria-labelledby="m1-workspace-title"
      data-m1-workspace="panda-field"
      data-dimensionality="2D"
    >
      <header className="m1-workspace-header">
        <div>
          <p className="m1-workspace-kicker">M1 · 2D only · Figure 5.1</p>
          <h2 id="m1-workspace-title">PANDA field</h2>
          <p>
            Signed normalized deviatoric difference from the backend two-SAP
            far-field kernel, with invalid regions explicitly masked.
          </p>
        </div>
        <span className="m1-workspace-badge">Qualitative</span>
      </header>
      <PandaQualitativeNotice />
      <PandaFieldStatus controller={controller} />
      <span className="sr-only">PANDA field is active.</span>
    </section>
  )
}

function PandaThermalFemStatus({
  controller,
  mesh,
}: {
  controller: PandaThermalFemController | null
  mesh: PandaMeshController | null
}) {
  if (controller?.phase === 'ready' && controller.result) {
    return <PandaThermalFemCanvas result={controller.result} />
  }

  if (
    controller?.phase !== 'loading' &&
    mesh?.phase === 'ready' &&
    mesh.result
  ) {
    return <PandaMeshCanvas result={mesh.result} />
  }

  let message =
    'Configure the PANDA geometry to generate the Figure 9.1 mesh preview.'
  if (controller?.phase === 'loading') {
    message =
      'Calculating the generalized-plane-strain thermoelastic FEM result…'
  } else if (mesh?.phase === 'loading') {
    message = 'Generating the constrained triangular PANDA mesh…'
  } else if (mesh?.phase === 'validation') {
    message =
      'The PANDA mesh is unavailable until the highlighted geometry inputs are valid.'
  } else if (mesh?.phase === 'error') {
    message =
      mesh.errorMessage ??
      'The PANDA mesh service could not complete this calculation.'
  } else if (controller?.phase === 'validation') {
    message =
      'The thermoelastic FEM result is unavailable until the highlighted inputs are valid.'
  } else if (controller?.phase === 'error') {
    message =
      controller.errorMessage ??
      'The PANDA thermal FEM service could not complete this calculation.'
  } else if (controller?.phase === 'ready') {
    message = 'The PANDA thermal FEM result is unavailable.'
  }

  return (
    <div
      className="m1-workspace-placeholder panda-mesh-status"
      role={controller?.phase === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <p>{message}</p>
      <p>No stale mesh or quantitative FEM field is displayed in this state.</p>
      {mesh?.phase === 'error' && (
        <button
          className="m1-retry-button"
          type="button"
          onClick={mesh.onRetry}
        >
          Retry mesh generation
        </button>
      )}
    </div>
  )
}

function FemWorkspace({
  controller,
  mesh,
}: {
  controller: PandaThermalFemController | null
  mesh: PandaMeshController | null
}) {
  return (
    <section
      className="m1-workspace"
      aria-labelledby="m1-workspace-title"
      data-m1-workspace="fem-mesh"
      data-dimensionality="2D"
    >
      <header className="m1-workspace-header">
        <div>
          <p className="m1-workspace-kicker">M1 · 2D only · Figure 9.1</p>
          <h2 id="m1-workspace-title">
            Generalized-plane-strain thermoelastic FEM
          </h2>
          <p>
            Step 2.8 extends the quantitative thermoelastic fields with
            bare-glass lateral pressure, a first-order scalar LP₀₁ photoelastic
            estimate, and a separate analytical torsion reference on the
            constrained triangular PANDA mesh.
          </p>
        </div>
        <span className="m1-workspace-badge">Quantitative FEM</span>
      </header>
      <M1FoundationCopy />
      <PandaThermalFemStatus controller={controller} mesh={mesh} />
      <p className="m1-fem-notice">
        Figure 9.1 shows the thermoelastic FEM fields, pressure increment, and
        local material birefringence. The optical result also reports a
        first-order scalar LP₀₁ photoelastic phase-birefringence estimate. It is
        not a validated vector-mode solution and does not include
        moving-boundary or deformed-waveguide contributions.
      </p>
      <span className="sr-only">Quantitative thermoelastic FEM is active.</span>
    </section>
  )
}

export function M1Workspace({
  workspace,
  pandaField = null,
  pandaMesh = null,
  thermalFem = null,
}: M1WorkspaceProps) {
  return workspace === 'panda-field' ? (
    <PandaFieldWorkspace controller={pandaField} />
  ) : (
    <FemWorkspace controller={thermalFem} mesh={pandaMesh} />
  )
}
