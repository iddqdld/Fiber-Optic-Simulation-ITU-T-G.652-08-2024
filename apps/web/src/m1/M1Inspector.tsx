import { M1FoundationCopy, PandaQualitativeNotice } from './M1Foundation'
import { getM1WorkspaceLabel, type M1WorkspaceId } from './M1WorkspaceCatalog'
import type {
  PandaFieldController,
  PandaFieldFieldErrors,
  PandaFieldInputName,
  PandaFieldPresentationMode,
} from './pandaFieldModel'
import {
  PANDA_THERMAL_FEM_REFINEMENT_LEVELS,
  type PandaThermalFemController,
} from './pandaThermalFemModel'

export type M1InspectorProps = {
  workspace: M1WorkspaceId
  pandaField?: PandaFieldController | null
  thermalFem?: PandaThermalFemController | null
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
    title: 'Sampling and presentation',
    note: 'Sampling changes backend resolution. 401 × 401 is the interactive default; 601 × 601 is an optional high-quality output. Figure 5.1 always draws the signed, dimensionless deviatoric-difference kernel.',
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
        boundary:
          'Odd integer from 401 to 601 inclusive; 401 × 401 is the interactive default and 601 × 601 is optional high-quality output.',
        step: '1',
      },
    ],
  },
]

const presentationModeOptions: ReadonlyArray<{
  value: PandaFieldPresentationMode
  label: string
  description: string
}> = [
  {
    value: 'validity_aware',
    label: 'Validity-aware (default)',
    description:
      'Applies the configured interface buffer and shows the backend validity mask.',
  },
  {
    value: 'reference_replica',
    label: 'Reference replica (comparison-only)',
    description:
      'Requests zero applied interface buffer so contours reach SAP boundaries; SAP interiors remain neutral.',
  },
]

const thermalFemInputGroup: InputGroup = {
  id: 'thermal-fem-thermal',
  title: 'Thermal mismatch',
  note: 'These are full per-region thermoelastic controls. Equal CTE values and zero temperature difference are valid test cases.',
  inputs: inputGroups[1].inputs.map((input) => ({
    ...input,
    boundary:
      input.name === 'temperatureC' || input.name === 'fictiveTemperatureC'
        ? 'Above −273.15 °C; equal temperatures are valid.'
        : 'Finite demonstration value in ×10⁻⁶/K; equal CTE values are valid.',
  })),
}

function NumericInput({
  definition,
  controller,
}: {
  definition: InputDefinition
  controller: Pick<PandaFieldController, 'values' | 'onValueChange'> & {
    fieldErrors: PandaFieldFieldErrors
  }
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

function ThermalFemControlInput({
  id,
  label,
  unit,
  value,
  error,
  onChange,
}: {
  id: string
  label: string
  unit: string
  value: string
  error: string | undefined
  onChange: (value: string) => void
}) {
  const boundaryId = `${id}-boundary`
  const errorId = `${id}-error`
  return (
    <div className={`m1-input-field${error ? ' m1-input-field--error' : ''}`}>
      <label htmlFor={id}>
        {label} ({unit})
      </label>
      <input
        id={id}
        type="number"
        step="any"
        value={value}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={`${boundaryId}${error ? ` ${errorId}` : ''}`}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <p id={boundaryId} className="m1-boundary-note">
        {unit === 'N'
          ? 'Axial resultant target in newtons.'
          : 'Input in microstrain; sent to the FEM service as dimensionless strain.'}
      </p>
      {error && (
        <p id={errorId} className="m1-input-error">
          {error}
        </p>
      )}
    </div>
  )
}

function ThermalFemInspector({
  pandaField,
  thermalFem,
}: {
  pandaField: PandaFieldController
  thermalFem: PandaThermalFemController
}) {
  const geometryGroup = inputGroups[0]
  const fieldController = {
    values: pandaField.values,
    fieldErrors: thermalFem.fieldErrors,
    onValueChange: pandaField.onValueChange,
  }
  return (
    <>
      <p className="m1-inspector-status" role="status">
        {thermalFem.statusLabel}
      </p>
      <p className="m1-inspector-status">
        Generalized-plane-strain thermoelastic FEM. The current UI uses
        demonstration values E = 72 GPa and ν = 0.17 in every region; CTE and
        temperature remain editable. Calculations run only when you press
        Calculate FEM.
      </p>
      {thermalFem.phase === 'error' && thermalFem.errorMessage && (
        <p className="m1-input-error" role="alert">
          {thermalFem.errorMessage}
        </p>
      )}
      <form
        className="m1-inspector-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <details className="m1-inspector-group" open>
          <summary>{geometryGroup.title}</summary>
          <div className="m1-inspector-group-content">
            <p className="m1-group-note">
              {geometryGroup.note} The same geometry drives both PANDA tabs.
            </p>
            <div className="m1-input-grid">
              {geometryGroup.inputs.map((definition) => (
                <NumericInput
                  key={definition.name}
                  definition={definition}
                  controller={fieldController}
                />
              ))}
            </div>
          </div>
        </details>
        <details className="m1-inspector-group" open>
          <summary>{thermalFemInputGroup.title}</summary>
          <div className="m1-inspector-group-content">
            <p className="m1-group-note">{thermalFemInputGroup.note}</p>
            <div className="m1-input-grid">
              {thermalFemInputGroup.inputs.map((definition) => (
                <NumericInput
                  key={definition.name}
                  definition={definition}
                  controller={fieldController}
                />
              ))}
            </div>
          </div>
        </details>
        <fieldset className="m1-presentation-fieldset">
          <legend>Axial condition</legend>
          <div className="m1-presentation-options">
            <label className="m1-radio-label">
              <span>
                <input
                  type="radio"
                  name="m1-panda-thermal-axial-condition"
                  value="free_resultant"
                  checked={
                    thermalFem.controls.axialCondition === 'free_resultant'
                  }
                  onChange={() =>
                    thermalFem.onAxialConditionChange('free_resultant')
                  }
                />{' '}
                Free axial resultant
              </span>
              <small>Solves the coupled axial equation with Nᶻ = 0.</small>
            </label>
            <label className="m1-radio-label">
              <span>
                <input
                  type="radio"
                  name="m1-panda-thermal-axial-condition"
                  value="prescribed_force"
                  checked={
                    thermalFem.controls.axialCondition === 'prescribed_force'
                  }
                  onChange={() =>
                    thermalFem.onAxialConditionChange('prescribed_force')
                  }
                />{' '}
                Prescribed axial force
              </span>
              <small>Sets the axial resultant target in newtons.</small>
            </label>
            <label className="m1-radio-label">
              <span>
                <input
                  type="radio"
                  name="m1-panda-thermal-axial-condition"
                  value="prescribed_strain"
                  checked={
                    thermalFem.controls.axialCondition === 'prescribed_strain'
                  }
                  onChange={() =>
                    thermalFem.onAxialConditionChange('prescribed_strain')
                  }
                />{' '}
                Prescribed axial strain
              </span>
              <small>
                Fixes εᶻᶻ⁰; the axial resultant is reported, not forced to zero.
              </small>
            </label>
          </div>
          {thermalFem.controls.axialCondition === 'prescribed_force' && (
            <ThermalFemControlInput
              id="m1-panda-thermal-force"
              label="Axial force"
              unit="N"
              value={thermalFem.controls.prescribedForceN}
              error={thermalFem.fieldErrors.axialForceN}
              onChange={thermalFem.onPrescribedForceChange}
            />
          )}
          {thermalFem.controls.axialCondition === 'prescribed_strain' && (
            <ThermalFemControlInput
              id="m1-panda-thermal-strain"
              label="Axial strain"
              unit="µε"
              value={thermalFem.controls.prescribedStrainMicrostrain}
              error={thermalFem.fieldErrors.prescribedStrainMicrostrain}
              onChange={thermalFem.onPrescribedStrainMicrostrainChange}
            />
          )}
        </fieldset>
        <fieldset className="m1-presentation-fieldset">
          <legend>FEM refinement</legend>
          <label htmlFor="m1-panda-thermal-refinement">Refinement level</label>
          <select
            id="m1-panda-thermal-refinement"
            value={thermalFem.controls.refinementLevel}
            onChange={(event) =>
              thermalFem.onRefinementLevelChange(
                Number(event.currentTarget.value) as 0 | 1 | 2,
              )
            }
          >
            {PANDA_THERMAL_FEM_REFINEMENT_LEVELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="m1-boundary-note">
            Standard is the normal interactive choice. Fine uses more compute
            and is intended for comparison.
          </p>
        </fieldset>
        <button
          className="m1-retry-button"
          type="button"
          disabled={thermalFem.phase === 'loading'}
          onClick={thermalFem.onCalculate}
        >
          {thermalFem.phase === 'loading'
            ? 'Calculating FEM…'
            : 'Calculate FEM'}
        </button>
      </form>
      {thermalFem.phase === 'error' && (
        <button
          className="m1-retry-button"
          type="button"
          onClick={thermalFem.onRetry}
        >
          Retry FEM calculation
        </button>
      )}
    </>
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
                <fieldset className="m1-presentation-fieldset">
                  <legend>Figure 5.1 presentation</legend>
                  <div className="m1-presentation-options">
                    {presentationModeOptions.map((option) => (
                      <label key={option.value} className="m1-radio-label">
                        <span>
                          <input
                            type="radio"
                            name="m1-panda-presentation-mode"
                            value={option.value}
                            checked={
                              controller.presentationMode === option.value
                            }
                            onChange={() =>
                              controller.onPresentationModeChange(option.value)
                            }
                          />{' '}
                          {option.label}
                        </span>
                        <small>{option.description}</small>
                      </label>
                    ))}
                  </div>
                  {controller.presentationMode === 'reference_replica' && (
                    <label className="m1-radio-label m1-spokes-label">
                      <span>
                        <input
                          type="checkbox"
                          checked={controller.showReferenceSpokes}
                          onChange={(event) =>
                            controller.onShowReferenceSpokesChange(
                              event.currentTarget.checked,
                            )
                          }
                        />{' '}
                        Show radial spokes
                      </span>
                      <small>
                        Comparison aid; available only in reference replica
                        mode.
                      </small>
                    </label>
                  )}
                  <p className="m1-boundary-note">
                    The configured interface-buffer input is retained when
                    switching modes; only the applied request value changes.
                  </p>
                </fieldset>
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
  thermalFem = null,
}: M1InspectorProps) {
  const isPandaField = workspace === 'panda-field'
  const isFemMesh = workspace === 'fem-mesh'

  return (
    <div className="m1-inspector">
      <h2>
        {isFemMesh
          ? 'Thermal FEM inspector'
          : `${getM1WorkspaceLabel(workspace)} inspector`}
      </h2>
      {isPandaField && pandaField ? (
        <PandaInspector controller={pandaField} />
      ) : isFemMesh && pandaField && thermalFem ? (
        <ThermalFemInspector pandaField={pandaField} thermalFem={thermalFem} />
      ) : (
        <>
          <M1FoundationCopy />
          <p className="m1-inspector-status" role="status">
            {isPandaField
              ? 'PANDA field controls are unavailable.'
              : 'The thermal FEM controls are unavailable.'}
          </p>
          <div className="m1-inspector-sections">
            <section aria-labelledby="m1-inspector-foundation-section">
              <h3 id="m1-inspector-foundation-section">2D foundation</h3>
              <p>
                {isPandaField
                  ? 'Connect the field-map controller to configure this view.'
                  : 'Connect the shared geometry and thermal FEM controller to configure this view.'}
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
