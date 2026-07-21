import type { RayGuidance } from './FibreGeometryView'
import {
  CAMERA_PRESET_OPTIONS,
  FIBRE_ROUTE_OPTIONS,
} from './fibreShowcase'
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
      <fieldset className="inspector-fieldset">
        <legend>Fibre route</legend>
        <label className="inspector-select-label" htmlFor="inspector-fibre-route">
          Path style
        </label>
        <select
          id="inspector-fibre-route"
          value={settings.fibreRoute}
          onChange={(event) =>
            update(
              'fibreRoute',
              event.currentTarget.value as VisualizationSettings['fibreRoute'],
            )
          }
        >
          {FIBRE_ROUTE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className="inspector-fieldset">
        <legend>Camera</legend>
        <div className="inspector-button-row" role="group" aria-label="Camera presets">
          {CAMERA_PRESET_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                settings.cameraPreset === option.id
                  ? 'inspector-preset-button is-active'
                  : 'inspector-preset-button'
              }
              aria-pressed={settings.cameraPreset === option.id}
              onClick={() => update('cameraPreset', option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="inspector-fieldset">
        <legend>Layers</legend>
        <label className="inspector-toggle" htmlFor="inspector-cladding-view">
          <input
            id="inspector-cladding-view"
            type="checkbox"
            checked={settings.claddingVisible}
            onChange={(event) =>
              update('claddingVisible', event.currentTarget.checked)
            }
          />
          Cladding shell
        </label>
        <label className="inspector-toggle" htmlFor="inspector-scale-markers">
          <input
            id="inspector-scale-markers"
            type="checkbox"
            checked={settings.scaleMarkersEnabled}
            onChange={(event) =>
              update('scaleMarkersEnabled', event.currentTarget.checked)
            }
          />
          Scale markers
        </label>
        <label className="inspector-toggle" htmlFor="inspector-power-indicators">
          <input
            id="inspector-power-indicators"
            type="checkbox"
            checked={settings.powerIndicatorsEnabled}
            onChange={(event) =>
              update('powerIndicatorsEnabled', event.currentTarget.checked)
            }
          />
          Spatial power indicators
        </label>
        <label className="inspector-toggle" htmlFor="inspector-pulse-markers">
          <input
            id="inspector-pulse-markers"
            type="checkbox"
            checked={settings.pulseMarkersEnabled}
            onChange={(event) =>
              update('pulseMarkersEnabled', event.currentTarget.checked)
            }
          />
          Spatial pulse markers
        </label>
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
      </fieldset>

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
        <div>
          <dt>Route / camera</dt>
          <dd>
            {settings.fibreRoute} · {settings.cameraPreset}
          </dd>
        </div>
      </dl>
      <p className="inspector-help">
        Visualization controls change display only and do not recalculate the
        simulation. Curved routes are schematic; power and pulse markers map
        backend samples onto the displayed path.
      </p>
    </div>
  )
}
