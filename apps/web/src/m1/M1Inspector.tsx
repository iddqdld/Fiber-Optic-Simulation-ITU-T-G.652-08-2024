import { M1FoundationCopy } from './M1Foundation'
import { getM1WorkspaceLabel, type M1WorkspaceId } from './M1WorkspaceCatalog'

export type M1InspectorProps = {
  workspace: M1WorkspaceId
}

const sections = [
  {
    id: 'geometry',
    title: 'Geometry',
    copy: 'Core, cladding, and two independent SAP regions will be configured here.',
  },
  {
    id: 'materials',
    title: 'Materials',
    copy: 'Material properties and their sources will be connected here.',
  },
  {
    id: 'thermal-loading',
    title: 'Thermal loading',
    copy: 'Temperature and the effective fictive temperature will be connected here.',
  },
  {
    id: 'display',
    title: '2D display',
    copy: 'Field, mesh, refinement, and display settings will be added here.',
  },
] as const

export function M1Inspector({ workspace }: M1InspectorProps) {
  return (
    <div className="m1-inspector">
      <h2>{getM1WorkspaceLabel(workspace)} inspector</h2>
      <M1FoundationCopy />
      <p className="m1-inspector-status" role="status">
        M1 calculations are not connected yet.
      </p>
      <div className="m1-inspector-sections">
        {sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`m1-inspector-section-${section.id}`}
          >
            <h3 id={`m1-inspector-section-${section.id}`}>{section.title}</h3>
            <p>{section.copy}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
