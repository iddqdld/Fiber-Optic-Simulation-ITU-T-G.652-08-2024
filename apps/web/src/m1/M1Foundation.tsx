export type { M1WorkspaceId } from './M1WorkspaceCatalog'

export function M1FoundationCopy() {
  return (
    <div className="m1-foundation-copy">
      <p>
        M1 studies a PANDA fibre cross-section using two-dimensional mechanical
        and photoelastic models.
      </p>
      <p>
        The field map and FEM views share one geometry while keeping their
        methods and validity limits explicit.
      </p>
    </div>
  )
}

export function PandaQualitativeNotice() {
  return (
    <div className="m1-qualitative-notice">
      <strong>Normalized qualitative model</strong>
      <p>
        Figure 5.1 plots only the signed normalized deviatoric-difference
        kernel. It is dimensionless, uses a fixed −1 to +1 range, and does not
        report stress in pascals.
      </p>
    </div>
  )
}
