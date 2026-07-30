import { M1FoundationCopy } from './M1Foundation'
import { getM1WorkspaceLabel, type M1WorkspaceId } from './M1WorkspaceCatalog'

export type M1ResultsProps = {
  workspace: M1WorkspaceId
}

export function M1Results({ workspace }: M1ResultsProps) {
  return (
    <section
      className="m1-results"
      aria-labelledby="m1-results-title"
      data-m1-results={workspace}
    >
      <h2 id="m1-results-title">{getM1WorkspaceLabel(workspace)} results</h2>
      <M1FoundationCopy />
      <dl className="m1-results-list">
        <div>
          <dt>Calculation</dt>
          <dd>Not run</dd>
        </div>
        <div>
          <dt>Quality status</dt>
          <dd>Not evaluated</dd>
        </div>
        <div>
          <dt>M1 warnings</dt>
          <dd>Not evaluated</dd>
        </div>
      </dl>
      <p className="m1-results-note">
        Numerical results, assumptions, and quality checks will appear after the
        M1 calculation foundation is connected.
      </p>
    </section>
  )
}
