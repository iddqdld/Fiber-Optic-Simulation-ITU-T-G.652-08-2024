import { useState, type ReactNode } from 'react'

import type { operations } from '../../../packages/shared_schemas/generated/api'
import type { FieldIssue, FieldIssues } from './fieldIssues'
import {
  getBoundaryKindLabel,
  getNumericFieldLabel,
  type FieldBoundaries,
  type FieldBoundary,
  type NumericFormField,
} from './parameterBoundaries'

export type {
  FieldBoundaries,
  FieldBoundary,
  NumericFormField,
} from './parameterBoundaries'

type PreviewRequest =
  operations['preview_level1_simulation']['requestBody']['content']['application/json']

export type Preset = PreviewRequest['preset']
export type CableApplication = PreviewRequest['fibre']['cable_application']

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

export type Level1FormProps = {
  values: FormValues
  error: string | null
  fieldIssues: FieldIssues
  fieldBoundaries: FieldBoundaries
  onNumericFieldChange: (field: NumericFormField, value: string) => void
  onPresetChange: (preset: Preset) => void
  onCableApplicationChange: (application: CableApplication) => void
}

type NumericInputProps = {
  id: string
  label: string
  name: NumericFormField
  value: string
  boundaries: readonly FieldBoundary[]
  onChange: (value: string) => void
  fieldIssues: readonly FieldIssue[]
  min?: number
  max?: number
  step?: number | 'any'
}

type InspectorSectionId =
  | 'preset'
  | 'fibre-geometry'
  | 'fibre-propagation'
  | 'optical-source'
  | 'link-section'
  | 'numerical-sampling'

type InspectorSectionProps = {
  id: InspectorSectionId
  title: string
  expanded: boolean
  onToggle: () => void
  issues: readonly FieldIssue[]
  children: ReactNode
}

type NumericSectionProps = {
  values: FormValues
  fieldIssues: FieldIssues
  fieldBoundaries: FieldBoundaries
  expanded: boolean
  onToggle: () => void
  onNumericFieldChange: Level1FormProps['onNumericFieldChange']
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

function collectFieldIssues(
  fieldIssues: FieldIssues,
  fields: readonly (NumericFormField | 'cable_application')[],
): readonly FieldIssue[] {
  return fields.flatMap((field) => fieldIssues[field] ?? [])
}

function getBoundaryKey(boundary: FieldBoundary): string {
  return [
    boundary.kind,
    boundary.label,
    boundary.rangeText,
    boundary.dependsOn.join(','),
    boundary.sourceModelId,
  ].join(':')
}

function BoundaryGuidance({
  id,
  boundaries,
}: {
  id: string
  boundaries: readonly FieldBoundary[]
}) {
  if (boundaries.length === 0) {
    return null
  }

  return (
    <ul id={id} className="level1-inspector-boundaries">
      {boundaries.map((boundary) => (
        <li
          key={getBoundaryKey(boundary)}
          className="level1-inspector-boundary"
          data-kind={boundary.kind}
        >
          <div className="level1-inspector-boundary-heading">
            <span
              className={`level1-inspector-boundary-kind level1-inspector-boundary-kind--${boundary.kind}`}
            >
              {getBoundaryKindLabel(boundary.kind)}
            </span>{' '}
            <span className="level1-inspector-boundary-label">
              {boundary.label}
            </span>
          </div>
          <span className="level1-inspector-boundary-range">
            {boundary.rangeText}
          </span>
          {boundary.dependsOn.length > 0 && (
            <span className="level1-inspector-boundary-dependencies">
              Updates with:{' '}
              {boundary.dependsOn
                .map((dependency) => getNumericFieldLabel(dependency))
                .join(', ')}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
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
  boundaries,
  onChange,
  fieldIssues,
  min,
  max,
  step = 'any',
}: NumericInputProps) {
  const tone = getIssueTone(fieldIssues)
  const boundaryDescriptionId = `${id}-boundaries`
  const issueDescriptionId = `${id}-issues`
  const describedBy = [
    boundaries.length > 0 ? boundaryDescriptionId : null,
    fieldIssues.length > 0 ? issueDescriptionId : null,
  ].filter((descriptionId): descriptionId is string => descriptionId !== null)

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
          describedBy.length > 0 ? describedBy.join(' ') : undefined
        }
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <BoundaryGuidance id={boundaryDescriptionId} boundaries={boundaries} />
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

function PresetInspectorSection({
  values,
  expanded,
  onToggle,
  onPresetChange,
}: {
  values: FormValues
  expanded: boolean
  onToggle: () => void
  onPresetChange: Level1FormProps['onPresetChange']
}) {
  return (
    <InspectorSection
      id="preset"
      title="Preset"
      expanded={expanded}
      onToggle={onToggle}
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
          G.652.D uses represented informative simulation defaults of 1550 nm
          wavelength, 0.275 dB/km attenuation, and 17 ps/(nm·km) dispersion.
          Other entered fibre, source, section, sampling, and cable-application
          assumptions are retained.
        </p>
      )}
    </InspectorSection>
  )
}

function FibreGeometryInspectorSection({
  values,
  fieldIssues,
  fieldBoundaries,
  expanded,
  onToggle,
  onNumericFieldChange,
}: NumericSectionProps) {
  return (
    <InspectorSection
      id="fibre-geometry"
      title="Fibre geometry"
      expanded={expanded}
      onToggle={onToggle}
      issues={collectFieldIssues(fieldIssues, [
        'n_core',
        'n_cladding',
        'core_radius_um',
        'mode_field_radius_um',
      ])}
    >
      <div className="form-grid level1-inspector-grid">
        <NumericInput
          id="n-core"
          name="n_core"
          label="Core refractive index (dimensionless)"
          value={values.n_core}
          min={Number.MIN_VALUE}
          boundaries={fieldBoundaries.n_core ?? []}
          fieldIssues={fieldIssues.n_core ?? []}
          onChange={(value) => onNumericFieldChange('n_core', value)}
        />
        <NumericInput
          id="n-cladding"
          name="n_cladding"
          label="Cladding refractive index (dimensionless)"
          value={values.n_cladding}
          min={Number.MIN_VALUE}
          boundaries={fieldBoundaries.n_cladding ?? []}
          fieldIssues={fieldIssues.n_cladding ?? []}
          onChange={(value) => onNumericFieldChange('n_cladding', value)}
        />
        <NumericInput
          id="core-radius"
          name="core_radius_um"
          label="Core radius (µm)"
          value={values.core_radius_um}
          min={Number.MIN_VALUE}
          boundaries={fieldBoundaries.core_radius_um ?? []}
          fieldIssues={fieldIssues.core_radius_um ?? []}
          onChange={(value) => onNumericFieldChange('core_radius_um', value)}
        />
        <NumericInput
          id="mode-field-radius"
          name="mode_field_radius_um"
          label="Mode-field radius (µm)"
          value={values.mode_field_radius_um}
          min={Number.MIN_VALUE}
          boundaries={fieldBoundaries.mode_field_radius_um ?? []}
          fieldIssues={fieldIssues.mode_field_radius_um ?? []}
          onChange={(value) =>
            onNumericFieldChange('mode_field_radius_um', value)
          }
        />
      </div>
    </InspectorSection>
  )
}

function FibrePropagationInspectorSection({
  values,
  fieldIssues,
  fieldBoundaries,
  expanded,
  onToggle,
  onNumericFieldChange,
  onCableApplicationChange,
}: NumericSectionProps & {
  onCableApplicationChange: Level1FormProps['onCableApplicationChange']
}) {
  return (
    <InspectorSection
      id="fibre-propagation"
      title="Fibre propagation"
      expanded={expanded}
      onToggle={onToggle}
      issues={collectFieldIssues(fieldIssues, [
        'group_index_dimensionless',
        'attenuation_db_per_km',
        'dispersion_ps_per_nm_km',
        'cable_application',
      ])}
    >
      <div className="form-grid level1-inspector-grid">
        <NumericInput
          id="group-index"
          name="group_index_dimensionless"
          label="Group index (dimensionless)"
          value={values.group_index_dimensionless}
          min={Number.MIN_VALUE}
          boundaries={fieldBoundaries.group_index_dimensionless ?? []}
          fieldIssues={fieldIssues.group_index_dimensionless ?? []}
          onChange={(value) =>
            onNumericFieldChange('group_index_dimensionless', value)
          }
        />
        <NumericInput
          id="attenuation"
          name="attenuation_db_per_km"
          label="Attenuation (dB/km)"
          value={values.attenuation_db_per_km}
          min={0}
          boundaries={fieldBoundaries.attenuation_db_per_km ?? []}
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
          boundaries={fieldBoundaries.dispersion_ps_per_nm_km ?? []}
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
  )
}

function OpticalSourceInspectorSection({
  values,
  fieldIssues,
  fieldBoundaries,
  expanded,
  onToggle,
  onNumericFieldChange,
}: NumericSectionProps) {
  return (
    <InspectorSection
      id="optical-source"
      title="Optical source"
      expanded={expanded}
      onToggle={onToggle}
      issues={collectFieldIssues(fieldIssues, [
        'wavelength_nm',
        'input_power_dbm',
        'spectral_width_fwhm_nm',
        'input_pulse_fwhm_ps',
      ])}
    >
      <div className="form-grid level1-inspector-grid">
        <NumericInput
          id="wavelength"
          name="wavelength_nm"
          label="Wavelength (nm)"
          value={values.wavelength_nm}
          min={Number.MIN_VALUE}
          boundaries={fieldBoundaries.wavelength_nm ?? []}
          fieldIssues={fieldIssues.wavelength_nm ?? []}
          onChange={(value) => onNumericFieldChange('wavelength_nm', value)}
        />
        <NumericInput
          id="input-power"
          name="input_power_dbm"
          label="Input power (dBm)"
          value={values.input_power_dbm}
          boundaries={fieldBoundaries.input_power_dbm ?? []}
          fieldIssues={fieldIssues.input_power_dbm ?? []}
          onChange={(value) => onNumericFieldChange('input_power_dbm', value)}
        />
        <NumericInput
          id="spectral-width"
          name="spectral_width_fwhm_nm"
          label="Spectral width FWHM (nm)"
          value={values.spectral_width_fwhm_nm}
          min={0}
          boundaries={fieldBoundaries.spectral_width_fwhm_nm ?? []}
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
          boundaries={fieldBoundaries.input_pulse_fwhm_ps ?? []}
          fieldIssues={fieldIssues.input_pulse_fwhm_ps ?? []}
          onChange={(value) =>
            onNumericFieldChange('input_pulse_fwhm_ps', value)
          }
        />
      </div>
    </InspectorSection>
  )
}

function LinkSection({
  values,
  fieldIssues,
  fieldBoundaries,
  expanded,
  onToggle,
  onNumericFieldChange,
}: NumericSectionProps) {
  return (
    <InspectorSection
      id="link-section"
      title="Link section"
      expanded={expanded}
      onToggle={onToggle}
      issues={collectFieldIssues(fieldIssues, ['length_km'])}
    >
      <div className="form-grid level1-inspector-grid">
        <NumericInput
          id="length"
          name="length_km"
          label="Section length (km)"
          value={values.length_km}
          min={0}
          boundaries={fieldBoundaries.length_km ?? []}
          fieldIssues={fieldIssues.length_km ?? []}
          onChange={(value) => onNumericFieldChange('length_km', value)}
        />
      </div>
    </InspectorSection>
  )
}

function NumericalSamplingInspectorSection({
  values,
  fieldIssues,
  fieldBoundaries,
  expanded,
  onToggle,
  onNumericFieldChange,
}: NumericSectionProps) {
  return (
    <InspectorSection
      id="numerical-sampling"
      title="Numerical sampling"
      expanded={expanded}
      onToggle={onToggle}
      issues={collectFieldIssues(fieldIssues, [
        'grid_half_width_um',
        'grid_points',
      ])}
    >
      <div className="form-grid level1-inspector-grid">
        <NumericInput
          id="grid-half-width"
          name="grid_half_width_um"
          label="Grid half-width (µm)"
          value={values.grid_half_width_um}
          min={Number.MIN_VALUE}
          boundaries={fieldBoundaries.grid_half_width_um ?? []}
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
          boundaries={fieldBoundaries.grid_points ?? []}
          fieldIssues={fieldIssues.grid_points ?? []}
          onChange={(value) => onNumericFieldChange('grid_points', value)}
        />
      </div>
      <p className="model-note level1-inspector-model-fact" role="note">
        Power-series sampling is backend generated; maximum 65 points.
      </p>
    </InspectorSection>
  )
}

export function Level1Form({
  values,
  error,
  fieldIssues,
  fieldBoundaries,
  onNumericFieldChange,
  onPresetChange,
  onCableApplicationChange,
}: Level1FormProps) {
  const [expandedSections, setExpandedSections] = useState<
    Set<InspectorSectionId>
  >(() => new Set(['preset', 'fibre-geometry']))

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

  const sectionProps = {
    values,
    fieldIssues,
    fieldBoundaries,
    onNumericFieldChange,
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
          <PresetInspectorSection
            values={values}
            expanded={expandedSections.has('preset')}
            onToggle={() => toggleSection('preset')}
            onPresetChange={onPresetChange}
          />
          <FibreGeometryInspectorSection
            {...sectionProps}
            expanded={expandedSections.has('fibre-geometry')}
            onToggle={() => toggleSection('fibre-geometry')}
          />
          <FibrePropagationInspectorSection
            {...sectionProps}
            expanded={expandedSections.has('fibre-propagation')}
            onToggle={() => toggleSection('fibre-propagation')}
            onCableApplicationChange={onCableApplicationChange}
          />
          <OpticalSourceInspectorSection
            {...sectionProps}
            expanded={expandedSections.has('optical-source')}
            onToggle={() => toggleSection('optical-source')}
          />
          <LinkSection
            {...sectionProps}
            expanded={expandedSections.has('link-section')}
            onToggle={() => toggleSection('link-section')}
          />
          <NumericalSamplingInspectorSection
            {...sectionProps}
            expanded={expandedSections.has('numerical-sampling')}
            onToggle={() => toggleSection('numerical-sampling')}
          />
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
