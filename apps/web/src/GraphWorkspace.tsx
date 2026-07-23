import type { ModeProfileData } from './FibreGeometryView'
import {
  graphDefinitions,
  type GraphWorkspaceId,
} from './graphWorkspaceCatalog'
import { PowerDistancePlot } from './PowerDistancePlot'
import { PulseComparisonPlot } from './PulseComparisonPlot'
import { RadialIntensityPlot } from './RadialIntensityPlot'
import type { PowerDistanceData } from './powerDistancePlot'
import type { PulseComparisonData } from './pulseComparisonPlot'
import type { KeyboardEvent } from 'react'

type GraphWorkspaceProps = {
  activeGraph: GraphWorkspaceId
  onActiveGraphChange: (graph: GraphWorkspaceId) => void
  modeProfile: ModeProfileData | null
  attenuation: PowerDistanceData | null
  pulseComparison: PulseComparisonData | null
}

function activeGraphContent({
  activeGraph,
  modeProfile,
  attenuation,
  pulseComparison,
}: Pick<
  GraphWorkspaceProps,
  'activeGraph' | 'modeProfile' | 'attenuation' | 'pulseComparison'
>) {
  if (activeGraph === 'power-vs-distance') {
    return <PowerDistancePlot attenuation={attenuation} />
  }

  if (activeGraph === 'pulse-comparison') {
    return <PulseComparisonPlot pulse={pulseComparison} />
  }

  return <RadialIntensityPlot modeProfile={modeProfile} />
}

export function GraphWorkspace({
  activeGraph,
  onActiveGraphChange,
  modeProfile,
  attenuation,
  pulseComparison,
}: GraphWorkspaceProps) {
  const activeDefinition =
    graphDefinitions.find((graph) => graph.id === activeGraph) ??
    graphDefinitions[0]
  const moveGraphFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number

    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % graphDefinitions.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex =
        (index - 1 + graphDefinitions.length) % graphDefinitions.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = graphDefinitions.length - 1
    } else {
      return
    }

    event.preventDefault()
    onActiveGraphChange(graphDefinitions[nextIndex].id)
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      )
    tabs?.[nextIndex]?.focus()
  }

  return (
    <section className="graph-workspace" aria-labelledby="graphs-title">
      <header className="workspace-options-bar">
        <div>
          <p className="workspace-kicker">Scientific plots</p>
          <h2 id="graphs-title">Graphs</h2>
          <p>{activeDefinition.description}</p>
        </div>
        <div
          className="graph-selector"
          role="tablist"
          aria-label="Scientific graph"
        >
          {graphDefinitions.map((graph, index) => (
            <button
              key={graph.id}
              id={`graph-tab-${graph.id}`}
              type="button"
              role="tab"
              aria-controls={`graph-panel-${graph.id}`}
              aria-selected={activeGraph === graph.id}
              tabIndex={activeGraph === graph.id ? 0 : -1}
              onClick={() => onActiveGraphChange(graph.id)}
              onKeyDown={(event) => moveGraphFocus(event, index)}
            >
              {graph.label}
            </button>
          ))}
        </div>
      </header>

      <div
        id={`graph-panel-${activeGraph}`}
        className="graph-workspace-surface"
        role="tabpanel"
        aria-labelledby={`graph-tab-${activeGraph}`}
      >
        {activeGraphContent({
          activeGraph,
          modeProfile,
          attenuation,
          pulseComparison,
        })}
      </div>
    </section>
  )
}
