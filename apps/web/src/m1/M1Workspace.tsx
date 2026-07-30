import { M1FoundationCopy, PandaQualitativeNotice } from './M1Foundation'
import type { M1WorkspaceId } from './M1WorkspaceCatalog'
import { PandaFieldCanvas } from './PandaFieldCanvas'
import type { PandaFieldController } from './pandaFieldModel'
import { PandaMeshCanvas } from './PandaMeshCanvas'
import type { PandaMeshController } from './pandaMeshModel'

export type M1WorkspaceProps = {
  workspace: M1WorkspaceId
  pandaField?: PandaFieldController | null
  pandaMesh?: PandaMeshController | null
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

function PandaMeshStatus({
  controller,
}: {
  controller: PandaMeshController | null
}) {
  if (controller?.phase === 'ready' && controller.result) {
    return <PandaMeshCanvas result={controller.result} />
  }

  let message = 'Configure the PANDA geometry to generate the Figure 9.1 mesh.'
  if (controller?.phase === 'loading') {
    message = 'Generating the constrained triangular PANDA mesh…'
  } else if (controller?.phase === 'validation') {
    message =
      'The PANDA mesh is unavailable until the highlighted inputs are valid.'
  } else if (controller?.phase === 'error') {
    message =
      controller.errorMessage ??
      'The PANDA mesh service could not complete this calculation.'
  } else if (controller?.phase === 'ready') {
    message = 'The PANDA mesh result is unavailable.'
  }

  return (
    <div
      className="m1-workspace-placeholder panda-mesh-status"
      role={controller?.phase === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <p>{message}</p>
      <p>No stale mesh is displayed in this state.</p>
    </div>
  )
}

function FemWorkspace({
  controller,
}: {
  controller: PandaMeshController | null
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
          <h2 id="m1-workspace-title">FEM mesh</h2>
          <p>
            A constrained triangular mesh preview of the core, cladding and two
            SAP regions, ready for the later FEM field step.
          </p>
        </div>
        <span className="m1-workspace-badge">Mesh preview</span>
      </header>
      <M1FoundationCopy />
      <PandaMeshStatus controller={controller} />
      <span className="sr-only">FEM mesh is active.</span>
    </section>
  )
}

export function M1Workspace({
  workspace,
  pandaField = null,
  pandaMesh = null,
}: M1WorkspaceProps) {
  return workspace === 'panda-field' ? (
    <PandaFieldWorkspace controller={pandaField} />
  ) : (
    <FemWorkspace controller={pandaMesh} />
  )
}
