import type { RayGuidance } from './FibreGeometryView'
import {
  modeDisplayThreshold,
  type VisualizationSettings,
} from './visualizationSettings'

type VisualizationInspectorProps = {
  settings: VisualizationSettings
  rayGuidance: RayGuidance | null
  onChange: (settings: VisualizationSettings) => void
}

function isValidGuidance(
  guidance: RayGuidance | null,
): guidance is RayGuidance {
  return (
    guidance !== null &&
    Number.isFinite(guidance.criticalAngleDeg) &&
    guidance.criticalAngleDeg > 0 &&
    guidance.criticalAngleDeg < 90
  )
}

export function VisualizationInspector({
  settings,
  rayGuidance,
  onChange,
}: VisualizationInspectorProps) {
  const update = <Key extends keyof VisualizationSettings>(
    key: Key,
    value: VisualizationSettings[Key],
  ) => onChange({ ...settings, [key]: value })
  const validGuidance = isValidGuidance(rayGuidance)

  return (
    <div className="visualization-inspector">
      <label className="inspector-toggle" htmlFor="inspector-ray-view">
        <input
          id="inspector-ray-view"
          type="checkbox"
          checked={settings.rayViewEnabled}
          onChange={(event) =>
            update('rayViewEnabled', event.currentTarget.checked)
          }
        />
        Educational ray
      </label>

      <div className="inspector-range">
        <label htmlFor="inspector-incidence-angle">
          Incidence angle
          <span>degrees</span>
        </label>
        <input
          id="inspector-incidence-angle"
          type="range"
          min="0"
          max="89.9"
          step="0.1"
          value={settings.incidenceAngleDeg}
          disabled={!settings.rayViewEnabled}
          onChange={(event) =>
            update('incidenceAngleDeg', Number(event.currentTarget.value))
          }
        />
        <div className="inspector-range-value">
          <span className="inspector-range-output">
            {settings.incidenceAngleDeg}°
          </span>
          <button
            type="button"
            disabled={!settings.rayViewEnabled || !validGuidance}
            onClick={() => {
              if (validGuidance) {
                update('incidenceAngleDeg', rayGuidance.criticalAngleDeg)
              }
            }}
          >
            Critical boundary
          </button>
        </div>
      </div>

      <label className="inspector-toggle" htmlFor="inspector-mode-view">
        <input
          id="inspector-mode-view"
          type="checkbox"
          checked={settings.modeViewEnabled}
          onChange={(event) =>
            update('modeViewEnabled', event.currentTarget.checked)
          }
        />
        Approximate LP01 field
      </label>

      <label className="inspector-toggle" htmlFor="inspector-pulse-view">
        <input
          id="inspector-pulse-view"
          type="checkbox"
          checked={settings.pulseAnimationEnabled}
          onChange={(event) =>
            update('pulseAnimationEnabled', event.currentTarget.checked)
          }
        />
        Scaled pulse animation
      </label>

      <div className="inspector-range">
        <label htmlFor="inspector-visual-length">
          Displayed fibre length
          <span>model units</span>
        </label>
        <input
          id="inspector-visual-length"
          type="range"
          min="4"
          max="12"
          step="1"
          value={settings.visualLength}
          onChange={(event) =>
            update('visualLength', Number(event.currentTarget.value))
          }
        />
        <span className="inspector-range-output">
          {settings.visualLength} model units
        </span>
      </div>

      <dl className="inspector-model-facts">
        <div>
          <dt>LP01 display threshold</dt>
          <dd>≥ {modeDisplayThreshold} normalized intensity</dd>
        </div>
      </dl>
      <p className="inspector-help">
        Visualization controls change display only and do not recalculate the
        simulation.
      </p>
    </div>
  )
}
