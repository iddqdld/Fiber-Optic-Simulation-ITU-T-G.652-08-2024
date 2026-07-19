import { useState } from 'react'

import type { RayGuidance } from './FibreGeometryView'
import {
  Level1Form,
  type CableApplication,
  type FormValues,
  type NumericFormField,
  type Preset,
} from './Level1Form'
import { VisualizationInspector } from './VisualizationInspector'
import type { VisualizationSettings } from './visualizationSettings'

type SimulationInspectorProps = {
  values: FormValues
  error: string | null
  settings: VisualizationSettings
  rayGuidance: RayGuidance | null
  onNumericFieldChange: (field: NumericFormField, value: string) => void
  onPresetChange: (preset: Preset) => void
  onCableApplicationChange: (application: CableApplication) => void
  onSettingsChange: (settings: VisualizationSettings) => void
}

export function SimulationInspector({
  values,
  error,
  settings,
  rayGuidance,
  onNumericFieldChange,
  onPresetChange,
  onCableApplicationChange,
  onSettingsChange,
}: SimulationInspectorProps) {
  const [visualizationExpanded, setVisualizationExpanded] = useState(true)

  return (
    <div className="editor-inspector-content">
      <Level1Form
        values={values}
        error={error}
        onNumericFieldChange={onNumericFieldChange}
        onPresetChange={onPresetChange}
        onCableApplicationChange={onCableApplicationChange}
      />
      <section
        className="level1-inspector-section visualization-section"
        role="group"
        aria-labelledby="visualization-section-heading"
      >
        <h3
          id="visualization-section-heading"
          className="level1-inspector-section-heading"
        >
          <button
            className="level1-inspector-section-toggle"
            type="button"
            aria-expanded={visualizationExpanded}
            aria-controls="visualization-section-panel"
            onClick={() => setVisualizationExpanded((expanded) => !expanded)}
          >
            <span>Visualization</span>
            <span aria-hidden="true">{visualizationExpanded ? '−' : '+'}</span>
          </button>
        </h3>
        <div
          id="visualization-section-panel"
          className="level1-inspector-section-panel"
          role="region"
          aria-labelledby="visualization-section-heading"
          hidden={!visualizationExpanded}
        >
          <VisualizationInspector
            settings={settings}
            rayGuidance={rayGuidance}
            onChange={onSettingsChange}
          />
        </div>
      </section>
    </div>
  )
}
