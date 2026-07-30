import { M1FoundationCopy } from './M1Foundation'
import { getM1WorkspaceLabel, type M1WorkspaceId } from './M1WorkspaceCatalog'

export type M1WorkspaceProps = {
  workspace: M1WorkspaceId
}

const workspaceDetails = {
  'panda-field': {
    figure: 'Figure 5.1',
    title: 'PANDA field',
    description:
      'This view will display the normalized qualitative deviatoric kernel from the analytical two-SAP approximation.',
    placeholder:
      'The normalized qualitative deviatoric kernel is not connected yet. No field values are being displayed.',
  },
  'fem-mesh': {
    figure: 'Figure 9.1',
    title: 'FEM mesh',
    description:
      'This view will display a 2D mesh refined around the core and the two SAP regions for later validation.',
    placeholder:
      'The 2D FEM mesh is not connected yet. No mesh or validation values are being displayed.',
  },
} as const satisfies Record<
  M1WorkspaceId,
  { figure: string; title: string; description: string; placeholder: string }
>

export function M1Workspace({ workspace }: M1WorkspaceProps) {
  const details = workspaceDetails[workspace]

  return (
    <section
      className="m1-workspace"
      aria-labelledby="m1-workspace-title"
      data-m1-workspace={workspace}
      data-dimensionality="2D"
    >
      <header className="m1-workspace-header">
        <div>
          <p className="m1-workspace-kicker">M1 · 2D only · {details.figure}</p>
          <h2 id="m1-workspace-title">{details.title}</h2>
          <p>{details.description}</p>
        </div>
        <span className="m1-workspace-badge">2D foundation</span>
      </header>
      <M1FoundationCopy />
      <div className="m1-workspace-placeholder" role="status">
        <p>{details.placeholder}</p>
        <p>Calculation and API integration will be added in a later step.</p>
      </div>
      <p className="m1-workspace-note">
        This placeholder intentionally contains no canvas, mesh, field, or
        calculated values.
      </p>
      <span className="sr-only">
        {getM1WorkspaceLabel(workspace)} is active.
      </span>
    </section>
  )
}
