import { M1FoundationCopy, PandaQualitativeNotice } from './M1Foundation'
import { getM1WorkspaceLabel, type M1WorkspaceId } from './M1WorkspaceCatalog'
import type {
  PandaFieldController,
  PandaFieldDisplay,
  PandaFieldInputName,
} from './pandaFieldModel'

export type M1InspectorProps = {
  workspace: M1WorkspaceId
  pandaField?: PandaFieldController | null
}

type InputDefinition = {
  name: PandaFieldInputName
  label: string
  unit: string
  boundary: string
  step?: string
}

type InputGroup = {
  id: string
  title: string
  note: string
  inputs: readonly InputDefinition[]
}

const inputGroups: readonly InputGroup[] = [
  {
    id: 'geometry',
    title: 'Geometry',
    note: 'Every circle must remain inside the cladding; the core and SAP regions cannot overlap.',
    inputs: [
      {
        name: 'coreRadiusUm',
        label: 'Core radius',
        unit: 'µm',
        boundary: 'Greater than 0 and smaller than the cladding radius.',
      },
      {
        name: 'claddingRadiusUm',
        label: 'Cladding radius',
        unit: 'µm',
        boundary:
          'Greater than 0 and large enough to contain the core and both SAPs.',
      },
      {
        name: 'coreCenterXUm',
        label: 'Core centre x',
        unit: 'µm',
        boundary:
          'Finite; the complete core circle must remain inside the cladding.',
      },
      {
        name: 'coreCenterYUm',
        label: 'Core centre y',
        unit: 'µm',
        boundary:
          'Finite; the complete core circle must remain inside the cladding.',
      },
      {
        name: 'sap1RadiusUm',
        label: 'SAP 1 radius',
        unit: 'µm',
        boundary: 'Greater than 0; SAP 1 must not overlap the core or SAP 2.',
      },
      {
        name: 'sap1CenterXUm',
        label: 'SAP 1 centre x',
        unit: 'µm',
        boundary: 'Finite; the complete SAP must remain inside the cladding.',
      },
      {
        name: 'sap1CenterYUm',
        label: 'SAP 1 centre y',
        unit: 'µm',
        boundary: 'Finite; the complete SAP must remain inside the cladding.',
      },
      {
        name: 'sap2RadiusUm',
        label: 'SAP 2 radius',
        unit: 'µm',
        boundary: 'Greater than 0; SAP 2 must not overlap the core or SAP 1.',
      },
      {
        name: 'sap2CenterXUm',
        label: 'SAP 2 centre x',
        unit: 'µm',
        boundary: 'Finite; the complete SAP must remain inside the cladding.',
      },
      {
        name: 'sap2CenterYUm',
        label: 'SAP 2 centre y',
        unit: 'µm',
        boundary: 'Finite; the complete SAP must remain inside the cladding.',
      },
    ],
  },
  {
    id: 'thermal',
    title: 'Thermal mismatch',
    note: 'At least one SAP CTE must differ from the cladding CTE, and the two temperatures must differ.',
    inputs: [
      {
        name: 'claddingCteMicroPerK',
        label: 'Cladding CTE',
        unit: '×10⁻⁶/K',
        boundary: 'Finite demonstration value in ×10⁻⁶/K.',
      },
      {
        name: 'sap1CteMicroPerK',
        label: 'SAP 1 CTE',
        unit: '×10⁻⁶/K',
        boundary: 'Finite; at least one SAP CTE must differ from the cladding.',
      },
      {
        name: 'sap2CteMicroPerK',
        label: 'SAP 2 CTE',
        unit: '×10⁻⁶/K',
        boundary: 'Finite; at least one SAP CTE must differ from the cladding.',
      },
      {
        name: 'temperatureC',
        label: 'Temperature',
        unit: '°C',
        boundary:
          'Above −273.15 °C and different from the effective fictive temperature.',
      },
      {
        name: 'fictiveTemperatureC',
        label: 'Effective fictive temperature',
        unit: '°C',
        boundary:
          'Above −273.15 °C and different from the current temperature.',
      },
    ],
  },
  {
    id: 'sampling-display',
    title: 'Sampling and display',
    note: 'Sampling changes backend resolution. Display selection changes only which returned grid is drawn.',
    inputs: [
      {
        name: 'interfaceBufferUm',
        label: 'Interface buffer',
        unit: 'µm',
        boundary: 'Zero or greater; masked around each SAP interface.',
      },
      {
        name: 'gridPoints',
        label: 'Grid points per axis',
        unit: 'points',
        boundary: 'Odd integer from 3 to 65 inclusive.',
        step: '1',
      },
    ],
  },
]

const displayOptions: ReadonlyArray<{
  value: PandaFieldDisplay
  label: string
}> = [
  { value: 'deviatoric', label: 'Deviatoric difference' },
  { value: 'shear', label: 'Shear' },
  { value: 'principal', label: 'Principal difference' },
]

function NumericInput({
  definition,
  controller,
}: {
  definition: InputDefinition
  controller: PandaFieldController
}) {
  const id = `m1-panda-${definition.name}`
  const boundaryId = `${id}-boundary`
  const errorId = `${id}-error`
  const error = controller.fieldErrors[definition.name]

  return (
    <div className={`m1-input-field${error ? ' m1-input-field--error' : ''}`}>
      <label htmlFor={id}>
        {definition.label} ({definition.unit})
      </label>
      <input
        id={id}
        name={definition.name}
        type="number"
        step={definition.step ?? 'any'}
        value={controller.values[definition.name]}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={`${boundaryId}${error ? ` ${errorId}` : ''}`}
        onChange={(event) =>
          controller.onValueChange(definition.name, event.currentTarget.value)
        }
      />
      <p id={boundaryId} className="m1-boundary-note">
        {definition.boundary}
      </p>
      {error && (
        <p id={errorId} className="m1-input-error">
          {error}
        </p>
      )}
    </div>
  )
}

function PandaInspector({ controller }: { controller: PandaFieldController }) {
  return (
    <>
      <PandaQualitativeNotice />
      <p className="m1-inspector-status" role="status">
        {controller.statusLabel}
      </p>
      {controller.phase === 'error' && controller.errorMessage && (
        <p className="m1-input-error" role="alert">
          {controller.errorMessage}
        </p>
      )}
      <p className="m1-inspector-status">
        Material values are demonstration-only. Only the SAP–cladding CTE
        mismatch and temperature interval enter this qualitative kernel;
        elasticity, refractive index and photoelastic coefficients do not.
      </p>
      <form
        className="m1-inspector-form"
        onSubmit={(event) => event.preventDefault()}
      >
        {inputGroups.map((group, index) => (
          <details
            key={group.id}
            className="m1-inspector-group"
            open={index === 0}
          >
            <summary>{group.title}</summary>
            <div className="m1-inspector-group-content">
              <p className="m1-group-note">{group.note}</p>
              <div className="m1-input-grid">
                {group.inputs.map((definition) => (
                  <NumericInput
                    key={definition.name}
                    definition={definition}
                    controller={controller}
                  />
                ))}
              </div>
              {group.id === 'sampling-display' && (
                <div className="m1-input-field">
                  <label htmlFor="m1-panda-display">Displayed field</label>
                  <select
                    id="m1-panda-display"
                    value={controller.display}
                    onChange={(event) =>
                      controller.onDisplayChange(
                        event.currentTarget.value as PandaFieldDisplay,
                      )
                    }
                  >
                    {displayOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="m1-boundary-note">
                    Fixed display range −1 to +1; principal difference occupies
                    0 to +1.
                  </p>
                </div>
              )}
            </div>
          </details>
        ))}
      </form>
      {controller.phase === 'error' && (
        <button
          className="m1-retry-button"
          type="button"
          onClick={controller.onRetry}
        >
          Retry field map
        </button>
      )}
    </>
  )
}

export function M1Inspector({
  workspace,
  pandaField = null,
}: M1InspectorProps) {
  const isPandaField = workspace === 'panda-field'

  return (
    <div className="m1-inspector">
      <h2>{getM1WorkspaceLabel(workspace)} inspector</h2>
      {isPandaField && pandaField ? (
        <PandaInspector controller={pandaField} />
      ) : (
        <>
          <M1FoundationCopy />
          <p className="m1-inspector-status" role="status">
            {isPandaField
              ? 'PANDA field controls are unavailable.'
              : 'The FEM mesh controls are not connected yet.'}
          </p>
          <div className="m1-inspector-sections">
            <section aria-labelledby="m1-inspector-foundation-section">
              <h3 id="m1-inspector-foundation-section">2D foundation</h3>
              <p>
                {isPandaField
                  ? 'Connect the field-map controller to configure this view.'
                  : 'Geometry, mesh refinement and display settings will be connected here.'}
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
