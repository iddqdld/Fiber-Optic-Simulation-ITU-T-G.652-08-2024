import type { operations } from '../../../packages/shared_schemas/generated/api'

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
  min?: number
  max?: number
  step?: number | 'any'
}

function NumericInput({
  id,
  label,
  name,
  value,
  onChange,
  min,
  max,
  step = 'any',
}: NumericInputProps) {
  return (
    <div className="form-field">
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
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  )
}

export function Level1Form({
  values,
  error,
  onNumericFieldChange,
  onPresetChange,
  onCableApplicationChange,
}: Level1FormProps) {
  return (
    <section
      className="calculator-card"
      aria-labelledby="level1-configuration-title"
      aria-label="Level 1 configuration"
    >
      <h2 id="level1-configuration-title">Level 1 configuration</h2>
      <form onSubmit={(event) => event.preventDefault()}>
        <div className="form-field">
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
          <p className="model-note">Custom fibre: standards checks are off.</p>
        ) : (
          <p className="model-note">
            G.652.D uses represented informative simulation defaults of 1550 nm
            wavelength, 0.275 dB/km attenuation, and 17 ps/(nm·km) dispersion.
            Other entered fibre, source, section, sampling, and
            cable-application assumptions are retained.
          </p>
        )}

        <fieldset>
          <legend>Fibre</legend>
          <div className="form-grid">
            <NumericInput
              id="n-core"
              name="n_core"
              label="Core refractive index (dimensionless)"
              value={values.n_core}
              min={Number.MIN_VALUE}
              onChange={(value) => onNumericFieldChange('n_core', value)}
            />
            <NumericInput
              id="n-cladding"
              name="n_cladding"
              label="Cladding refractive index (dimensionless)"
              value={values.n_cladding}
              min={Number.MIN_VALUE}
              onChange={(value) => onNumericFieldChange('n_cladding', value)}
            />
            <NumericInput
              id="core-radius"
              name="core_radius_um"
              label="Core radius (µm)"
              value={values.core_radius_um}
              min={Number.MIN_VALUE}
              onChange={(value) =>
                onNumericFieldChange('core_radius_um', value)
              }
            />
            <NumericInput
              id="mode-field-radius"
              name="mode_field_radius_um"
              label="Mode-field radius (µm)"
              value={values.mode_field_radius_um}
              min={Number.MIN_VALUE}
              onChange={(value) =>
                onNumericFieldChange('mode_field_radius_um', value)
              }
            />
            <NumericInput
              id="attenuation"
              name="attenuation_db_per_km"
              label="Attenuation (dB/km)"
              value={values.attenuation_db_per_km}
              min={0}
              onChange={(value) =>
                onNumericFieldChange('attenuation_db_per_km', value)
              }
            />
            <NumericInput
              id="dispersion"
              name="dispersion_ps_per_nm_km"
              label="Dispersion (ps/(nm km))"
              value={values.dispersion_ps_per_nm_km}
              onChange={(value) =>
                onNumericFieldChange('dispersion_ps_per_nm_km', value)
              }
            />
            <NumericInput
              id="group-index"
              name="group_index_dimensionless"
              label="Group index (dimensionless)"
              value={values.group_index_dimensionless}
              min={Number.MIN_VALUE}
              onChange={(value) =>
                onNumericFieldChange('group_index_dimensionless', value)
              }
            />
            <div className="form-field">
              <label htmlFor="cable-application">Cable application</label>
              <select
                id="cable-application"
                name="cable_application"
                value={values.cable_application}
                onChange={(event) =>
                  onCableApplicationChange(
                    event.currentTarget.value as CableApplication,
                  )
                }
              >
                <option value="standard_cable">Standard cable</option>
                <option value="short_jumper">Short jumper</option>
                <option value="indoor_cable">Indoor cable</option>
                <option value="drop_cable">Drop cable</option>
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Source</legend>
          <div className="form-grid">
            <NumericInput
              id="wavelength"
              name="wavelength_nm"
              label="Wavelength (nm)"
              value={values.wavelength_nm}
              min={Number.MIN_VALUE}
              onChange={(value) => onNumericFieldChange('wavelength_nm', value)}
            />
            <NumericInput
              id="input-power"
              name="input_power_dbm"
              label="Input power (dBm)"
              value={values.input_power_dbm}
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
              onChange={(value) =>
                onNumericFieldChange('input_pulse_fwhm_ps', value)
              }
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Section</legend>
          <div className="form-grid">
            <NumericInput
              id="length"
              name="length_km"
              label="Section length (km)"
              value={values.length_km}
              min={0}
              onChange={(value) => onNumericFieldChange('length_km', value)}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Sampling</legend>
          <div className="form-grid">
            <NumericInput
              id="grid-half-width"
              name="grid_half_width_um"
              label="Grid half-width (µm)"
              value={values.grid_half_width_um}
              min={Number.MIN_VALUE}
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
              onChange={(value) => onNumericFieldChange('grid_points', value)}
            />
          </div>
        </fieldset>
      </form>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
