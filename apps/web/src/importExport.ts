import type {
  components,
  operations,
} from '../../../packages/shared_schemas/generated/api'
import type { FormValues } from './Level1Form'
import type { PowerDistanceData } from './powerDistancePlot'
import {
  getPulseComparisonPlotData,
  type PulseComparisonData,
  type PulseComparisonPlotData,
} from './pulseComparisonPlot'

type PreviewResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']
type ModeProfileResult = PreviewResult['mode_profile']
type MacrobendLossResult = components['schemas']['MacrobendLossResult']

/**
 * Represents a portable simulation configuration container.
 * Encapsulates form parameters alongside versioning and export metadata
 * to ensure robust validation and future schema migration capability.
 */
export interface ExportedConfiguration {

  version: '1.0'
  type: 'g652-simulation-config'
  exportedAt: string
  formValues: FormValues

}

/**
 * Sanitizes values for CSV inclusion.
 * Escapes quotes, commas, and newlines according to standard RFC 4180 rules.
 */
function escapeCsvValue(value: string | number | boolean): string {
  const stringifiedValue = String(value)

  if (
    stringifiedValue.includes(',') ||
    stringifiedValue.includes('"') ||
    stringifiedValue.includes('\n')
  ) {
    return `"${stringifiedValue.replaceAll('"', '""')}"`
  }

  return stringifiedValue
}

/**
 * Serializes user form parameters to a formatted JSON string.
 */
export function serializeConfiguration(formValues: FormValues): string {
  const exportedConfiguration: ExportedConfiguration = {
    version: '1.0',
    type: 'g652-simulation-config',
    exportedAt: new Date().toISOString(),
    formValues,
  }

  return JSON.stringify(exportedConfiguration, null, 2)
}

const requiredFormFields: readonly (keyof FormValues)[] = [
  'preset',
  'n_core',
  'n_cladding',
  'core_radius_um',
  'mode_field_radius_um',
  'attenuation_db_per_km',
  'dispersion_ps_per_nm_km',
  'group_index_dimensionless',
  'cable_application',
  'wavelength_nm',
  'input_power_dbm',
  'spectral_width_fwhm_nm',
  'input_pulse_fwhm_ps',
  'length_km',
  'grid_half_width_um',
  'grid_points',
]

/**
 * Deserializes and validates an imported JSON configuration file.
 * Returns an explicit union result detailing success or specific validation errors.
 */
export function parseAndValidateConfiguration(
  fileContent: string,
): { success: true; formValues: FormValues } | { success: false; error: string } {
  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(fileContent)
  } catch {
    return {
      success: false,
      error: 'Invalid JSON format. Please ensure the file contains valid JSON.',
    }
  }

  if (
    typeof parsedJson !== 'object' ||
    parsedJson === null ||
    Array.isArray(parsedJson)
  ) {
    return {
      success: false,
      error: 'Configuration file root must be a JSON object.',
    }
  }

  const record = parsedJson as Record<string, unknown>

  if (record.type !== 'g652-simulation-config') {
    return {
      success: false,
      error:
        'Unrecognized configuration file type. Expected "g652-simulation-config".',
    }
  }

  if (record.version !== '1.0') {
    return {
      success: false,
      error: `Unsupported configuration version "${String(record.version)}". Expected "1.0".`,
    }
  }

  if (
    typeof record.formValues !== 'object' ||
    record.formValues === null ||
    Array.isArray(record.formValues)
  ) {
    return {
      success: false,
      error: 'Configuration file is missing a valid "formValues" object.',
    }
  }

  const importedFormValues = record.formValues as Record<string, unknown>

  for (const fieldName of requiredFormFields) {
    if (
      typeof importedFormValues[fieldName] !== 'string' ||
      importedFormValues[fieldName].trim().length === 0
    ) {
      return {
        success: false,
        error: `Missing or invalid required field "${fieldName}" in configuration.`,
      }
    }
  }

  return {
    success: true,
    formValues: importedFormValues as FormValues,
  }
}

/**
 * Serializes complete simulation results to JSON format.
 */
export function exportSimulationResultJson(previewResult: PreviewResult): string {
  const exportPayload = {
    version: '1.0',
    type: 'g652-simulation-result',
    exportedAt: new Date().toISOString(),
    result: previewResult,
  }

  return JSON.stringify(exportPayload, null, 2)
}

/**
 * Generates a CSV summary of all simulation parameters, calculated metrics, and standards checks.
 */
export function exportMetricsCsv(
  previewResult: PreviewResult,
  formValues?: FormValues,
): string {
  const rows: string[][] = [
    ['Category', 'Parameter / Metric', 'Value', 'Unit', 'Details / Compliance'],
  ]

  // Add form input values if provided
  if (formValues !== undefined) {
    rows.push(
      ['Input', 'Preset', formValues.preset, '', 'Fibre preset selection'],
      ['Input', 'Core Refractive Index (n_core)', formValues.n_core, '', ''],
      ['Input', 'Cladding Refractive Index (n_cladding)', formValues.n_cladding, '', ''],
      ['Input', 'Core Radius', formValues.core_radius_um, 'µm', ''],
      ['Input', 'Mode Field Radius (MFD/2)', formValues.mode_field_radius_um, 'µm', ''],
      ['Input', 'Attenuation', formValues.attenuation_db_per_km, 'dB/km', ''],
      ['Input', 'Dispersion', formValues.dispersion_ps_per_nm_km, 'ps/(nm·km)', ''],
      ['Input', 'Group Index', formValues.group_index_dimensionless, '', ''],
      ['Input', 'Cable Application', formValues.cable_application, '', ''],
      ['Input', 'Wavelength', formValues.wavelength_nm, 'nm', ''],
      ['Input', 'Input Power', formValues.input_power_dbm, 'dBm', ''],
      ['Input', 'Spectral Width FWHM', formValues.spectral_width_fwhm_nm, 'nm', ''],
      ['Input', 'Input Pulse FWHM', formValues.input_pulse_fwhm_ps, 'ps', ''],
      ['Input', 'Fiber Length', formValues.length_km, 'km', ''],
    )
  }

  // Add calculated parameters and metrics
  const guidance = previewResult.guidance
  if (guidance !== null && guidance !== undefined) {
    const vParameter = guidance.v_number_dimensionless
    rows.push([
      'Calculated Metric',
      'V Parameter',
      String(vParameter),
      '',
      vParameter < 2.405 ? 'Single-mode operation (V < 2.405)' : 'Multimode operation',
    ])
    rows.push([
      'Calculated Metric',
      'Numerical Aperture (NA)',
      String(guidance.numerical_aperture_dimensionless),
      '',
      '',
    ])
  }

  const modeProfile = previewResult.mode_profile
  if (modeProfile !== null && modeProfile !== undefined) {
    const mfd = modeProfile.mode_field_radius_um * 2
    rows.push([
      'Calculated Metric',
      'Mode Field Diameter (MFD)',
      String(mfd),
      'µm',
      '',
    ])
  }

  const attenuation = previewResult.attenuation
  if (attenuation !== null && attenuation !== undefined) {
    rows.push([
      'Calculated Metric',
      'Total Section Loss',
      String(attenuation.section_loss_db),
      'dB',
      '',
    ])
    rows.push([
      'Calculated Metric',
      'Output Power',
      String(attenuation.output_power_dbm),
      'dBm',
      '',
    ])
  }

  const pulseBroadening = previewResult.pulse_broadening
  if (pulseBroadening !== null && pulseBroadening !== undefined) {
    rows.push([
      'Calculated Metric',
      'Accumulated Dispersion',
      String(pulseBroadening.accumulated_dispersion_ps_per_nm),
      'ps/nm',
      '',
    ])
    rows.push([
      'Calculated Metric',
      'Pulse Broadening FWHM',
      String(pulseBroadening.dispersion_broadening_fwhm_ps),
      'ps',
      '',
    ])
    rows.push([
      'Calculated Metric',
      'Output Pulse FWHM',
      String(pulseBroadening.output_pulse_fwhm_ps),
      'ps',
      '',
    ])
  }

  // Add standards checks
  const checks = previewResult.standards_checks
  if (checks.attenuation !== null && checks.attenuation !== undefined) {
    const status = checks.attenuation.status
    const maxLimit = checks.attenuation.maximum_attenuation_db_per_km
    rows.push([
      'Standard Check',
      'Attenuation Standard',
      status === 'pass' ? 'PASS' : status.toUpperCase(),
      '',
      maxLimit !== null ? `Limit: ${maxLimit} dB/km` : '',
    ])
  }

  if (checks.dispersion !== null && checks.dispersion !== undefined) {
    const status = checks.dispersion.status
    const maxLimit = checks.dispersion.maximum_dispersion_ps_per_nm_km
    rows.push([
      'Standard Check',
      'Dispersion Standard',
      status === 'pass' ? 'PASS' : status.toUpperCase(),
      '',
      `Limit: ${maxLimit} ps/(nm·km)`,
    ])
  }

  return rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
    .join('\n')
}

/**
 * Generates CSV format for Power vs Distance curve dataset.
 */
export function exportPowerDistanceCsv(
  powerDistanceData: PowerDistanceData,
): string {
  const rows: string[][] = [
    ['Distance (km)', 'Power (dBm)', 'Power (mW)'],
  ]

  const distanceSamples = powerDistanceData.distanceSamplesKm
  const powerSamples = powerDistanceData.powerSamplesDbm

  for (let index = 0; index < distanceSamples.length; index += 1) {
    const distanceKm = distanceSamples[index]
    const powerDbm = powerSamples[index]
    const powerMw = Math.pow(10, powerDbm / 10)

    rows.push([
      String(distanceKm),
      String(powerDbm),
      String(powerMw.toFixed(6)),
    ])
  }

  return rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
    .join('\n')
}

/**
 * Generates CSV format for Mode Profile / Radial Intensity dataset.
 */
export function exportRadialIntensityCsv(
  modeProfile: ModeProfileResult,
): string {
  const rows: string[][] = [
    ['Radius (µm)', 'Normalized Intensity', 'Electric Field Amplitude'],
  ]

  const record = modeProfile as unknown as Record<string, unknown>
  const coordinates = Array.isArray(record.radius_um)
    ? (record.radius_um as number[])
    : Array.isArray(record.x_um)
      ? (record.x_um as number[])
      : []

  const intensitySeries = Array.isArray(record.normalized_intensity)
    ? record.normalized_intensity
    : []

  const fieldSeries = Array.isArray(record.electric_field)
    ? record.electric_field
    : Array.isArray(record.normalized_field)
      ? record.normalized_field
      : []

  for (let index = 0; index < coordinates.length; index += 1) {
    const intensityVal = Array.isArray(intensitySeries[index])
      ? (intensitySeries[index] as number[])[0]
      : intensitySeries[index]
    const fieldVal = Array.isArray(fieldSeries[index])
      ? (fieldSeries[index] as number[])[0]
      : fieldSeries[index]

    rows.push([
      String(coordinates[index]),
      intensityVal !== undefined ? String(intensityVal) : '',
      fieldVal !== undefined ? String(fieldVal) : '',
    ])
  }

  return rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
    .join('\n')
}

/**
 * Generates CSV format for Pulse Comparison dataset (Input vs Output).
 */
export function exportPulseComparisonCsv(
  pulseData: PulseComparisonData | PulseComparisonPlotData,
): string {
  const rows: string[][] = [
    [
      'Time (ps)',
      'Input Pulse Intensity',
      'Output Pulse Intensity',
    ],
  ]

  const plotData = getPulseComparisonPlotData(pulseData)
  if (plotData === null) {
    return rows
      .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
      .join('\n')
  }

  const inputSamples = plotData.inputProfile
  const outputSamples = plotData.outputProfile

  for (let index = 0; index < inputSamples.length; index += 1) {
    const timePs = inputSamples[index].timePs
    const inputValue = inputSamples[index].normalizedValue
    const outputValue = outputSamples[index] !== undefined
      ? outputSamples[index].normalizedValue
      : 0

    rows.push([
      String(timePs),
      String(inputValue),
      String(outputValue),
    ])
  }

  return rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
    .join('\n')
}

/**
 * Generates CSV format for Macrobend Loss dataset if available.
 */
export function exportMacrobendLossCsv(
  macrobendResult: MacrobendLossResult,
): string {
  const rows: string[][] = [
    [
      'Bend #',
      'Position Fraction',
      'Radius (mm)',
      'Angle (deg)',
      'Supplied Loss (dB)',
      'Cumulative Loss (dB)',
      'Output Power (dBm)',
    ],
  ]

  const bends = macrobendResult.bends ?? []
  for (let index = 0; index < bends.length; index += 1) {
    const bend = bends[index]
    rows.push([
      String(index + 1),
      String(bend.position_fraction),
      String(bend.radius_mm),
      String(bend.angle_deg),
      String(bend.supplied_loss_db),
      String(bend.cumulative_bend_loss_db),
      String(bend.output_power_dbm),
    ])
  }

  rows.push([
    'TOTAL SUMMARY',
    '-',
    '-',
    '-',
    '-',
    String(macrobendResult.total_bend_loss_db),
    String(macrobendResult.output_power_dbm),
  ])

  return rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
    .join('\n')
}

/**
 * Triggers file download in browser environment using DOM anchor element.
 */
export function downloadFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchorElement = document.createElement('a')

  anchorElement.href = url
  anchorElement.download = filename
  document.body.appendChild(anchorElement)
  anchorElement.click()
  document.body.removeChild(anchorElement)
  URL.revokeObjectURL(url)
}
