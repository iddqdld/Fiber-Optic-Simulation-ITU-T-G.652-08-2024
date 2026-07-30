import { M1FoundationCopy, PandaQualitativeNotice } from './M1Foundation'
import type { M1WorkspaceId } from './M1WorkspaceCatalog'
import { PandaFieldCanvas } from './PandaFieldCanvas'
import type { PandaFieldController } from './pandaFieldModel'

export type M1WorkspaceProps = {
  workspace: M1WorkspaceId
  pandaField?: PandaFieldController | null
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
        display={controller.display}
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
            Normalized qualitative fields from the backend two-SAP far-field
            kernel, with invalid regions explicitly masked.
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

function FemWorkspace() {
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
            This view will display a 2D mesh refined around the core and the two
            SAP regions for later validation.
          </p>
        </div>
        <span className="m1-workspace-badge">2D foundation</span>
      </header>
      <M1FoundationCopy />
      <div className="m1-workspace-placeholder" role="status">
        <p>
          The 2D FEM mesh is not connected yet. No mesh or validation values are
          being displayed.
        </p>
        <p>
          Mesh generation and FEM calculation will be added in a later step.
        </p>
      </div>
      <p className="m1-workspace-note">
        This placeholder intentionally contains no canvas, mesh, field, or
        calculated values.
      </p>
      <span className="sr-only">FEM mesh is active.</span>
    </section>
  )
}

export function M1Workspace({
  workspace,
  pandaField = null,
}: M1WorkspaceProps) {
  return workspace === 'panda-field' ? (
    <PandaFieldWorkspace controller={pandaField} />
  ) : (
    <FemWorkspace />
  )
}
