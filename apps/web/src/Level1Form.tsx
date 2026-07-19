import { useState, type ReactNode } from 'react'

import type { operations } from '../../../packages/shared_schemas/generated/api'
import type { FieldIssue, FieldIssues } from './fieldIssues'

type PreviewRequest =
  operations['preview_level1_simulation']['requestBody']['content']['application/json']

export type Preset = PreviewRequest['preset']
export type CableApplication = PreviewRequest['fibre']['cable_application']
export type NumericFormField =
  | 'n_core'
  | 'n_cladding'
  | 'core_radius_um'
  | 'mode_field_radius_um'
  | 'attenuation_db_per_km'
  | 'dispersion_ps_per_nm_km'
  | 'group_index_dimensionless'
  | 'wavelength_nm'
  | 'input_power_dbm'
  | 'spectral_width_fwhm_nm'
  | 'input_pulse_fwhm_ps'
  | 'length_km'
  | 'grid_half_width_um'
  | 'grid_points'

export type FormValues = {
  preset: Preset
  n_core: string
  n_cladding: string
  core_radius_um: string
  mode_field_radius_um: string
  attenuation_db_per_km: string
  dispersion_ps_per_nm_km: string
  group_index_dimensionless: string
  cable_application: CableApplication
  wavelength_nm: string
  input_power_dbm: string
  spectral_width_fwhm_nm: string
  input_pulse_fwhm_ps: string
  length_km: string
  grid_half_width_um: string
  grid_points: string
}

type Level1FormProps = {
  values: FormValues
  error: string | null
  fieldIssues: FieldIssues
  onNumericFieldChange: (field: NumericFormField, value: string) => void
  onPresetChange: (preset: Preset) => void
  onCableApplicationChange: (application: CableApplication) => void
}

type NumericInputProps = {
  id: string
  label: string
  name: NumericFormField
  value: string
  onChange: (value: string) => void
  fieldIssues: readonly FieldIssue[]
  min?: number
  max?: number
  step?: number | 'any'
}

type InspectorSectionId = 'preset' | 'fibre' | 'source' | 'section' | 'sampling'

type InspectorSectionProps = {
  id: InspectorSectionId
  title: string
  expanded: boolean
  onToggle: () => void
  issues: readonly FieldIssue[]
  children: ReactNode
}

function getIssueTone(
  issues: readonly FieldIssue[],
): FieldIssue['tone'] | undefined {
  if (issues.some((issue) => issue.tone === 'error')) {
    return 'error'
  }

  return issues.length > 0 ? 'warning' : undefined
}

function getFieldClassName(
  baseClassName: string,
  tone: FieldIssue['tone'] | undefined,
  toneClassName = baseClassName,
) {
  return tone ? `${baseClassName} ${toneClassName}--${tone}` : baseClassName
}

function IssueNotes({
  id,
  issues,
}: {
  id: string
  issues: readonly FieldIssue[]
}) {
  if (issues.length === 0) {
    return null
  }

  return (
    <ul id={id} className="level1-inspector-issues">
      {issues.map((issue) => (
        <li
          key={`${issue.tone}-${issue.message}`}
          className={`level1-inspector-issue level1-inspector-issue--${issue.tone}`}
          data-tone={issue.tone}
        >
          <span className="level1-inspector-issue-label">
            {issue.tone === 'error' ? 'Error' : 'Warning'}:
          </span>{' '}
          {issue.message}
        </li>
      ))}
    </ul>
  )
}

function NumericInput({
  id,
  label,
  name,
  value,
  onChange,
  fieldIssues,
  min,
  max,
  step = 'any',
}: NumericInputProps) {
  const tone = getIssueTone(fieldIssues)
  const issueDescriptionId = `${id}-issues`

  return (
    <div
      className={getFieldClassName(
        'form-field level1-inspector-field',
        tone,
        'level1-inspector-field',
      )}
      data-tone={tone}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="number"
        required
        value={value}
        min={min}
        max={max}
        step={step}
        aria-invalid={tone === 'error' ? true : undefined}
        aria-describedby={
          fieldIssues.length > 0 ? issueDescriptionId : undefined
        }
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <IssueNotes id={issueDescriptionId} issues={fieldIssues} />
    </div>
  )
}

function CableApplicationInput({
  value,
  fieldIssues,
  onChange,
}: {
  value: CableApplication
  fieldIssues: readonly FieldIssue[]
  onChange: (application: CableApplication) => void
}) {
  const tone = getIssueTone(fieldIssues)

  return (
    <div
      className={getFieldClassName(
        'form-field level1-inspector-field',
        tone,
        'level1-inspector-field',
      )}
      data-tone={tone}
    >
      <label htmlFor="cable-application">Cable application</label>
      <select
        id="cable-application"
        name="cable_application"
        value={value}
        aria-invalid={tone === 'error' ? true : undefined}
        aria-describedby={
          fieldIssues.length > 0 ? 'cable-application-issues' : undefined
        }
        onChange={(event) =>
          onChange(event.currentTarget.value as CableApplication)
        }
      >
        <option value="standard_cable">Standard cable</option>
        <option value="short_jumper">Short jumper</option>
        <option value="indoor_cable">Indoor cable</option>
        <option value="drop_cable">Drop cable</option>
      </select>
      <IssueNotes id="cable-application-issues" issues={fieldIssues} />
    </div>
  )
}

function InspectorSection({
  id,
  title,
  expanded,
  onToggle,
  issues,
  children,
}: InspectorSectionProps) {
  const headingId = `level1-inspector-${id}-heading`
  const panelId = `level1-inspector-${id}-panel`
  const issueTone = getIssueTone(issues)
  const issueSummaryId = `${headingId}-issues`
  const issueSummary = issueTone
    ? `${issueTone === 'error' ? 'Error' : 'Warning'}: ${issues.length} ${
        issues.length === 1 ? 'issue' : 'issues'
      }`
    : null

  return (
    <section
      className="level1-inspector-section"
      data-tone={issueTone}
      role="group"
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="level1-inspector-section-heading">
        <button
          type="button"
          aria-label={title}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-describedby={issueSummary ? issueSummaryId : undefined}
          data-tone={issueTone}
          className={getFieldClassName(
            'level1-inspector-section-toggle',
            issueTone,
          )}
          onClick={onToggle}
        >
          <span>{title}</span>
          {issueSummary && (
            <span
              id={issueSummaryId}
              className="level1-inspector-section-issues"
              data-tone={issueTone}
            >
              {issueSummary}
            </span>
          )}
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
      </h3>
      <div
        id={panelId}
        className="level1-inspector-section-panel"
        role="region"
        aria-labelledby={headingId}
        hidden={!expanded}
      >
        {children}
      </div>
    </section>
  )
}

function FibreInspectorSection({
  values,
  fieldIssues,
  expanded,
  onToggle,
  onNumericFieldChange,
}: {
  values: FormValues
  fieldIssues: FieldIssues
  expanded: boolean
  onToggle: () => void
  onNumericFieldChange: Level1FormProps['onNumericFieldChange']
}) {
  return (
    <InspectorSection
      id="fibre"
      title="Fibre"
      expanded={expanded}
      onToggle={onToggle}
      issues={[
        ...(fieldIssues.n_core ?? []),
        ...(fieldIssues.n_cladding ?? []),
        ...(fieldIssues.core_radius_um ?? []),
        ...(fieldIssues.mode_field_radius_um ?? []),
        ...(fieldIssues.group_index_dimensionless ?? []),
      ]}
    >
      <div className="form-grid level1-inspector-grid">
        <NumericInput
          id="n-core"
          name="n_core"
          label="Core refractive index (dimensionless)"
          value={values.n_core}
          min={Number.MIN_VALUE}
          fieldIssues={fieldIssues.n_core ?? []}
          onChange={(value) => onNumericFieldChange('n_core', value)}
        />
        <NumericInput
          id="n-cladding"
          name="n_cladding"
          label="Cladding refractive index (dimensionless)"
          value={values.n_cladding}
          min={Number.MIN_VALUE}
          fieldIssues={fieldIssues.n_cladding ?? []}
          onChange={(value) => onNumericFieldChange('n_cladding', value)}
        />
        <NumericInput
          id="core-radius"
          name="core_radius_um"
          label="Core radius (µm)"
          value={values.core_radius_um}
          min={Number.MIN_VALUE}
          fieldIssues={fieldIssues.core_radius_um ?? []}
          onChange={(value) => onNumericFieldChange('core_radius_um', value)}
        />
        <NumericInput
          id="mode-field-radius"
          name="mode_field_radius_um"
          label="Mode-field radius (µm)"
          value={values.mode_field_radius_um}
          min={Number.MIN_VALUE}
          fieldIssues={fieldIssues.mode_field_radius_um ?? []}
          onChange={(value) =>
            onNumericFieldChange('mode_field_radius_um', value)
          }
        />
        <NumericInput
          id="group-index"
          name="group_index_dimensionless"
          label="Group index (dimensionless)"
          value={values.group_index_dimensionless}
          min={Number.MIN_VALUE}
          fieldIssues={fieldIssues.group_index_dimensionless ?? []}
          onChange={(value) =>
            onNumericFieldChange('group_index_dimensionless', value)
          }
        />
      </div>
    </InspectorSection>
  )
}

export function Level1Form({
  values,
  error,
  fieldIssues,
  onNumericFieldChange,
  onPresetChange,
  onCableApplicationChange,
}: Level1FormProps) {
  const [expandedSections, setExpandedSections] = useState<
    Set<InspectorSectionId>
  >(() => new Set(['preset', 'fibre']))

  const toggleSection = (section: InspectorSectionId) => {
    setExpandedSections((current) => {
      const next = new Set(current)

      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }

      return next
    })
  }

  return (
    <section
      className="level1-inspector calculator-card"
      aria-labelledby="level1-configuration-title"
      aria-label="Level 1 configuration"
    >
      <h2 id="level1-configuration-title">Level 1 configuration</h2>
      <form
        className="level1-inspector-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="level1-inspector-accordion">
          <InspectorSection
            id="preset"
            title="Preset"
            expanded={expandedSections.has('preset')}
            onToggle={() => toggleSection('preset')}
            issues={[]}
          >
            <div className="form-field level1-inspector-field">
              <label htmlFor="fibre-preset">Fibre preset</label>
              <select
                id="fibre-preset"
                name="preset"
                value={values.preset}
                onChange={(event) =>
                  onPresetChange(event.currentTarget.value as Preset)
                }
              >
                <option value="custom">Custom fibre</option>
                <option value="g652d">ITU-T G.652.D</option>
              </select>
            </div>

            {values.preset === 'custom' ? (
              <p className="model-note level1-inspector-model-note">
                Custom fibre: standards checks are off.
              </p>
            ) : (
              <p className="model-note level1-inspector-model-note">
                G.652.D uses represented informative simulation defaults of 1550
                nm wavelength, 0.275 dB/km attenuation, and 17 ps/(nm·km)
                dispersion. Other entered fibre, source, section, sampling, and
                cable-application assumptions are retained.
              </p>
            )}
          </InspectorSection>

          <FibreInspectorSection
            values={values}
            fieldIssues={fieldIssues}
            expanded={expandedSections.has('fibre')}
            onToggle={() => toggleSection('fibre')}
            onNumericFieldChange={onNumericFieldChange}
          />

          <InspectorSection
            id="source"
            title="Source"
            expanded={expandedSections.has('source')}
            onToggle={() => toggleSection('source')}
            issues={[
              ...(fieldIssues.wavelength_nm ?? []),
              ...(fieldIssues.input_power_dbm ?? []),
              ...(fieldIssues.spectral_width_fwhm_nm ?? []),
              ...(fieldIssues.input_pulse_fwhm_ps ?? []),
            ]}
          >
            <div className="form-grid level1-inspector-grid">
              <NumericInput
                id="wavelength"
                name="wavelength_nm"
                label="Wavelength (nm)"
                value={values.wavelength_nm}
                min={Number.MIN_VALUE}
                fieldIssues={fieldIssues.wavelength_nm ?? []}
                onChange={(value) =>
                  onNumericFieldChange('wavelength_nm', value)
                }
              />
              <NumericInput
                id="input-power"
                name="input_power_dbm"
                label="Input power (dBm)"
                value={values.input_power_dbm}
                fieldIssues={fieldIssues.input_power_dbm ?? []}
                onChange={(value) =>
                  onNumericFieldChange('input_power_dbm', value)
                }
              />
              <NumericInput
                id="spectral-width"
                name="spectral_width_fwhm_nm"
                label="Spectral width FWHM (nm)"
                value={values.spectral_width_fwhm_nm}
                min={0}
                fieldIssues={fieldIssues.spectral_width_fwhm_nm ?? []}
                onChange={(value) =>
                  onNumericFieldChange('spectral_width_fwhm_nm', value)
                }
              />
              <NumericInput
                id="input-pulse"
                name="input_pulse_fwhm_ps"
                label="Input pulse FWHM (ps)"
                value={values.input_pulse_fwhm_ps}
                min={Number.MIN_VALUE}
                fieldIssues={fieldIssues.input_pulse_fwhm_ps ?? []}
                onChange={(value) =>
                  onNumericFieldChange('input_pulse_fwhm_ps', value)
                }
              />
            </div>
          </InspectorSection>

          <InspectorSection
            id="section"
            title="Section"
            expanded={expandedSections.has('section')}
            onToggle={() => toggleSection('section')}
            issues={[
              ...(fieldIssues.length_km ?? []),
              ...(fieldIssues.attenuation_db_per_km ?? []),
              ...(fieldIssues.dispersion_ps_per_nm_km ?? []),
              ...(fieldIssues.cable_application ?? []),
            ]}
          >
            <div className="form-grid level1-inspector-grid">
              <NumericInput
                id="length"
                name="length_km"
                label="Section length (km)"
                value={values.length_km}
                min={0}
                fieldIssues={fieldIssues.length_km ?? []}
                onChange={(value) => onNumericFieldChange('length_km', value)}
              />
              <NumericInput
                id="attenuation"
                name="attenuation_db_per_km"
                label="Attenuation (dB/km)"
                value={values.attenuation_db_per_km}
                min={0}
                fieldIssues={fieldIssues.attenuation_db_per_km ?? []}
                onChange={(value) =>
                  onNumericFieldChange('attenuation_db_per_km', value)
                }
              />
              <NumericInput
                id="dispersion"
                name="dispersion_ps_per_nm_km"
                label="Dispersion (ps/(nm km))"
                value={values.dispersion_ps_per_nm_km}
                fieldIssues={fieldIssues.dispersion_ps_per_nm_km ?? []}
                onChange={(value) =>
                  onNumericFieldChange('dispersion_ps_per_nm_km', value)
                }
              />
              <CableApplicationInput
                value={values.cable_application}
                fieldIssues={fieldIssues.cable_application ?? []}
                onChange={onCableApplicationChange}
              />
            </div>
          </InspectorSection>

          <InspectorSection
            id="sampling"
            title="Sampling"
            expanded={expandedSections.has('sampling')}
            onToggle={() => toggleSection('sampling')}
            issues={[
              ...(fieldIssues.grid_half_width_um ?? []),
              ...(fieldIssues.grid_points ?? []),
            ]}
          >
            <div className="form-grid level1-inspector-grid">
              <NumericInput
                id="grid-half-width"
                name="grid_half_width_um"
                label="Grid half-width (µm)"
                value={values.grid_half_width_um}
                min={Number.MIN_VALUE}
                fieldIssues={fieldIssues.grid_half_width_um ?? []}
                onChange={(value) =>
                  onNumericFieldChange('grid_half_width_um', value)
                }
              />
              <NumericInput
                id="grid-points"
                name="grid_points"
                label="Grid points (count)"
                value={values.grid_points}
                min={3}
                max={65}
                step={1}
                fieldIssues={fieldIssues.grid_points ?? []}
                onChange={(value) => onNumericFieldChange('grid_points', value)}
              />
            </div>
            <p className="model-note level1-inspector-model-fact" role="note">
              Power-series sampling is backend generated; maximum 65 points.
            </p>
          </InspectorSection>
        </div>
      </form>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
