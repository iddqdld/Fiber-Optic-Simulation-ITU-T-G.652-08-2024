import type { operations } from '../../../../packages/shared_schemas/generated/api'

export type PandaFieldRequest =
  operations['calculate_panda_field_map']['requestBody']['content']['application/json']
export type PandaFieldResult =
  operations['calculate_panda_field_map']['responses'][200]['content']['application/json']

export type PandaFieldDisplay = 'deviatoric' | 'shear' | 'principal'

export type PandaFieldInputName =
  | 'coreRadiusUm'
  | 'claddingRadiusUm'
  | 'coreCenterXUm'
  | 'coreCenterYUm'
  | 'sap1RadiusUm'
  | 'sap1CenterXUm'
  | 'sap1CenterYUm'
  | 'sap2RadiusUm'
  | 'sap2CenterXUm'
  | 'sap2CenterYUm'
  | 'claddingCteMicroPerK'
  | 'sap1CteMicroPerK'
  | 'sap2CteMicroPerK'
  | 'temperatureC'
  | 'fictiveTemperatureC'
  | 'interfaceBufferUm'
  | 'gridPoints'

export type PandaFieldFormValues = Record<PandaFieldInputName, string>
export type PandaFieldPhase =
  'idle' | 'loading' | 'ready' | 'validation' | 'error'
export type PandaFieldFieldErrors = Partial<Record<PandaFieldInputName, string>>

export type PandaFieldController = {
  values: PandaFieldFormValues
  display: PandaFieldDisplay
  result: PandaFieldResult | null
  phase: PandaFieldPhase
  statusLabel: string
  errorMessage: string | null
  fieldErrors: PandaFieldFieldErrors
  onValueChange: (name: PandaFieldInputName, value: string) => void
  onDisplayChange: (display: PandaFieldDisplay) => void
  onRetry: () => void
}

export type PandaFieldParseResult = {
  request: PandaFieldRequest | null
  fieldErrors: PandaFieldFieldErrors
}

export const initialPandaFieldValues: PandaFieldFormValues = {
  coreRadiusUm: '4.1',
  claddingRadiusUm: '62.5',
  coreCenterXUm: '0',
  coreCenterYUm: '0',
  sap1RadiusUm: '15',
  sap1CenterXUm: '-30',
  sap1CenterYUm: '0',
  sap2RadiusUm: '15',
  sap2CenterXUm: '30',
  sap2CenterYUm: '0',
  claddingCteMicroPerK: '0.55',
  sap1CteMicroPerK: '1.2',
  sap2CteMicroPerK: '1.2',
  temperatureC: '20',
  fictiveTemperatureC: '1200',
  interfaceBufferUm: '2',
  gridPoints: '65',
}

const inputNames = Object.keys(initialPandaFieldValues) as PandaFieldInputName[]
const warningCodes = new Set([
  'qualitative_uncalibrated',
  'finite_cladding_approximation',
  'zero_interface_buffer',
])
const equationReferences = [
  'M1-3.3',
  'M1-5.3',
  'M1-5.4',
  'M1-5.5',
  'M1-5.6',
  'M1-5.7',
] as const
const materialConfidences = new Set([
  'measured_sample',
  'manufacturer',
  'literature_composition',
  'calibrated_effective',
  'demonstration_only',
])
const NORMALIZED_TOLERANCE = 1e-12
const MICROMETRES_TO_METRES = 1e-6
const MICRO_CTE_TO_CTE = 1e-6
const CELSIUS_TO_KELVIN = 273.15

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseFinite(
  values: PandaFieldFormValues,
  name: PandaFieldInputName,
  fieldErrors: PandaFieldFieldErrors,
): number | null {
  const text = values[name].trim()
  const parsed = text === '' ? Number.NaN : Number(text)
  if (!Number.isFinite(parsed)) {
    fieldErrors[name] = 'Enter a finite number.'
    return null
  }
  return parsed
}

function addError(
  fieldErrors: PandaFieldFieldErrors,
  name: PandaFieldInputName,
  message: string,
) {
  fieldErrors[name] ??= message
}

function demonstrationMaterial(name: string, ctePerK: number) {
  return {
    name,
    composition: null,
    young_modulus_pa: 72e9,
    poisson_ratio: 0.17,
    cte_per_k: ctePerK,
    refractive_index: 1.45,
    p11: 0.121,
    p12: 0.27,
    c1_per_pa: null,
    c2_per_pa: null,
    photoelastic_convention: 'p11_p12_strain' as const,
    source: {
      citation: 'M1 UI demonstration values, not manufacturer data',
      confidence: 'demonstration_only' as const,
      source_date: null,
      notes: 'M1 UI demonstration values only; not manufacturer data.',
    },
  }
}

export function parsePandaFieldValues(
  values: PandaFieldFormValues,
): PandaFieldParseResult {
  const fieldErrors: PandaFieldFieldErrors = {}
  const parsed = Object.fromEntries(
    inputNames.map((name) => [name, parseFinite(values, name, fieldErrors)]),
  ) as Record<PandaFieldInputName, number | null>

  if (Object.values(parsed).some((value) => value === null)) {
    return { request: null, fieldErrors }
  }

  const numbers = parsed as Record<PandaFieldInputName, number>
  const positiveRadiusFields = [
    'coreRadiusUm',
    'claddingRadiusUm',
    'sap1RadiusUm',
    'sap2RadiusUm',
  ] as const
  for (const name of positiveRadiusFields) {
    if (numbers[name] <= 0) {
      addError(fieldErrors, name, 'Radius must be greater than zero.')
    }
  }

  for (const name of ['temperatureC', 'fictiveTemperatureC'] as const) {
    if (numbers[name] <= -CELSIUS_TO_KELVIN) {
      addError(fieldErrors, name, 'Temperature must be above absolute zero.')
    }
  }
  if (numbers.interfaceBufferUm < 0) {
    addError(
      fieldErrors,
      'interfaceBufferUm',
      'Interface buffer must be zero or greater.',
    )
  }
  if (
    !Number.isInteger(numbers.gridPoints) ||
    numbers.gridPoints < 3 ||
    numbers.gridPoints > 65 ||
    numbers.gridPoints % 2 === 0
  ) {
    addError(
      fieldErrors,
      'gridPoints',
      'Grid points must be an odd integer from 3 to 65.',
    )
  }

  if (numbers.coreRadiusUm >= numbers.claddingRadiusUm) {
    addError(
      fieldErrors,
      'coreRadiusUm',
      'Core radius must be smaller than the cladding radius.',
    )
  }
  const coreDistance = Math.hypot(numbers.coreCenterXUm, numbers.coreCenterYUm)
  if (coreDistance + numbers.coreRadiusUm > numbers.claddingRadiusUm) {
    const message = 'Core must remain fully inside the cladding.'
    addError(fieldErrors, 'coreRadiusUm', message)
    addError(fieldErrors, 'coreCenterXUm', message)
    addError(fieldErrors, 'coreCenterYUm', message)
  }

  const sapInputs = [
    {
      prefix: 'SAP 1',
      radius: numbers.sap1RadiusUm,
      x: numbers.sap1CenterXUm,
      y: numbers.sap1CenterYUm,
      fields: ['sap1RadiusUm', 'sap1CenterXUm', 'sap1CenterYUm'] as const,
    },
    {
      prefix: 'SAP 2',
      radius: numbers.sap2RadiusUm,
      x: numbers.sap2CenterXUm,
      y: numbers.sap2CenterYUm,
      fields: ['sap2RadiusUm', 'sap2CenterXUm', 'sap2CenterYUm'] as const,
    },
  ]
  for (const sap of sapInputs) {
    if (Math.hypot(sap.x, sap.y) + sap.radius > numbers.claddingRadiusUm) {
      const message = `${sap.prefix} must remain fully inside the cladding.`
      for (const field of sap.fields) {
        addError(fieldErrors, field, message)
      }
    }
    if (
      Math.hypot(sap.x - numbers.coreCenterXUm, sap.y - numbers.coreCenterYUm) <
      sap.radius + numbers.coreRadiusUm
    ) {
      const message = `${sap.prefix} must not overlap the core.`
      for (const field of sap.fields) {
        addError(fieldErrors, field, message)
      }
    }
  }
  if (
    Math.hypot(
      numbers.sap1CenterXUm - numbers.sap2CenterXUm,
      numbers.sap1CenterYUm - numbers.sap2CenterYUm,
    ) <
    numbers.sap1RadiusUm + numbers.sap2RadiusUm
  ) {
    const message = 'The two SAP regions must not overlap.'
    for (const field of [
      'sap1RadiusUm',
      'sap1CenterXUm',
      'sap1CenterYUm',
      'sap2RadiusUm',
      'sap2CenterXUm',
      'sap2CenterYUm',
    ] as const) {
      addError(fieldErrors, field, message)
    }
  }

  if (numbers.temperatureC === numbers.fictiveTemperatureC) {
    addError(
      fieldErrors,
      'temperatureC',
      'Temperature must differ from the effective fictive temperature.',
    )
    addError(
      fieldErrors,
      'fictiveTemperatureC',
      'Effective fictive temperature must differ from temperature.',
    )
  }
  if (
    numbers.sap1CteMicroPerK === numbers.claddingCteMicroPerK &&
    numbers.sap2CteMicroPerK === numbers.claddingCteMicroPerK
  ) {
    const message = 'At least one SAP CTE must differ from the cladding CTE.'
    addError(fieldErrors, 'sap1CteMicroPerK', message)
    addError(fieldErrors, 'sap2CteMicroPerK', message)
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { request: null, fieldErrors }
  }

  const claddingCtePerK = numbers.claddingCteMicroPerK * MICRO_CTE_TO_CTE
  const sap1CtePerK = numbers.sap1CteMicroPerK * MICRO_CTE_TO_CTE
  const sap2CtePerK = numbers.sap2CteMicroPerK * MICRO_CTE_TO_CTE
  const claddingRadiusM = numbers.claddingRadiusUm * MICROMETRES_TO_METRES

  return {
    fieldErrors,
    request: {
      geometry: {
        core_radius_m: numbers.coreRadiusUm * MICROMETRES_TO_METRES,
        cladding_radius_m: claddingRadiusM,
        core_center_x_m: numbers.coreCenterXUm * MICROMETRES_TO_METRES,
        core_center_y_m: numbers.coreCenterYUm * MICROMETRES_TO_METRES,
        sap_1: {
          radius_m: numbers.sap1RadiusUm * MICROMETRES_TO_METRES,
          center_x_m: numbers.sap1CenterXUm * MICROMETRES_TO_METRES,
          center_y_m: numbers.sap1CenterYUm * MICROMETRES_TO_METRES,
        },
        sap_2: {
          radius_m: numbers.sap2RadiusUm * MICROMETRES_TO_METRES,
          center_x_m: numbers.sap2CenterXUm * MICROMETRES_TO_METRES,
          center_y_m: numbers.sap2CenterYUm * MICROMETRES_TO_METRES,
        },
      },
      materials: {
        core: demonstrationMaterial(
          'M1 UI demonstration core',
          claddingCtePerK,
        ),
        cladding: demonstrationMaterial(
          'M1 UI demonstration cladding',
          claddingCtePerK,
        ),
        sap_1: demonstrationMaterial('M1 UI demonstration SAP 1', sap1CtePerK),
        sap_2: demonstrationMaterial('M1 UI demonstration SAP 2', sap2CtePerK),
      },
      thermal: {
        temperature_k: numbers.temperatureC + CELSIUS_TO_KELVIN,
        effective_fictive_temperature_k:
          numbers.fictiveTemperatureC + CELSIUS_TO_KELVIN,
      },
      wavelength_m: 1.55e-6,
      sampling: {
        grid_half_width_m: claddingRadiusM,
        grid_points: numbers.gridPoints,
        interface_buffer_m: numbers.interfaceBufferUm * MICROMETRES_TO_METRES,
      },
    },
  }
}

function isMaterialSource(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.citation) &&
    materialConfidences.has(String(value.confidence)) &&
    (value.source_date === null || typeof value.source_date === 'string') &&
    typeof value.notes === 'string'
  )
}

function isPandaMaterial(value: unknown) {
  if (!(
    isRecord(value) &&
    isNonEmptyString(value.name) &&
    (value.composition === null || typeof value.composition === 'string') &&
    isFiniteNumber(value.young_modulus_pa) &&
    value.young_modulus_pa > 0 &&
    isFiniteNumber(value.poisson_ratio) &&
    value.poisson_ratio > -1 &&
    value.poisson_ratio < 0.5 &&
    isFiniteNumber(value.cte_per_k) &&
    isFiniteNumber(value.refractive_index) &&
    value.refractive_index > 0 &&
    (value.p11 === null || isFiniteNumber(value.p11)) &&
    (value.p12 === null || isFiniteNumber(value.p12)) &&
    (value.c1_per_pa === null || isFiniteNumber(value.c1_per_pa)) &&
    (value.c2_per_pa === null || isFiniteNumber(value.c2_per_pa)) &&
    (value.photoelastic_convention === 'p11_p12_strain' ||
      value.photoelastic_convention === 'c1_c2_stress_optic') &&
    isMaterialSource(value.source)
  )) {
    return false
  }

  return value.photoelastic_convention === 'p11_p12_strain'
    ? isFiniteNumber(value.p11) &&
        isFiniteNumber(value.p12) &&
        value.c1_per_pa === null &&
        value.c2_per_pa === null
    : value.p11 === null &&
        value.p12 === null &&
        isFiniteNumber(value.c1_per_pa) &&
        isFiniteNumber(value.c2_per_pa)
}

function isCircularSap(value: unknown) {
  return (
    isRecord(value) &&
    isFiniteNumber(value.radius_m) &&
    value.radius_m > 0 &&
    isFiniteNumber(value.center_x_m) &&
    isFiniteNumber(value.center_y_m)
  )
}

function isPandaRequest(value: unknown): value is PandaFieldRequest {
  if (!isRecord(value)) {
    return false
  }
  const geometry = value.geometry
  const materials = value.materials
  const thermal = value.thermal
  const sampling = value.sampling
  return (
    isRecord(geometry) &&
    isFiniteNumber(geometry.core_radius_m) &&
    geometry.core_radius_m > 0 &&
    isFiniteNumber(geometry.cladding_radius_m) &&
    geometry.cladding_radius_m > 0 &&
    isFiniteNumber(geometry.core_center_x_m) &&
    isFiniteNumber(geometry.core_center_y_m) &&
    isCircularSap(geometry.sap_1) &&
    isCircularSap(geometry.sap_2) &&
    isRecord(materials) &&
    isPandaMaterial(materials.core) &&
    isPandaMaterial(materials.cladding) &&
    isPandaMaterial(materials.sap_1) &&
    isPandaMaterial(materials.sap_2) &&
    isRecord(thermal) &&
    isFiniteNumber(thermal.temperature_k) &&
    thermal.temperature_k > 0 &&
    isFiniteNumber(thermal.effective_fictive_temperature_k) &&
    thermal.effective_fictive_temperature_k > 0 &&
    isFiniteNumber(value.wavelength_m) &&
    value.wavelength_m > 0 &&
    isRecord(sampling) &&
    isFiniteNumber(sampling.grid_half_width_m) &&
    sampling.grid_half_width_m > 0 &&
    isFiniteNumber(sampling.grid_points) &&
    Number.isInteger(sampling.grid_points) &&
    Number(sampling.grid_points) >= 3 &&
    Number(sampling.grid_points) <= 65 &&
    Number(sampling.grid_points) % 2 === 1 &&
    isFiniteNumber(sampling.interface_buffer_m) &&
    sampling.interface_buffer_m >= 0
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

function isFiniteArray(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(isFiniteNumber)
  )
}

function isBooleanGrid(value: unknown, size: number): value is boolean[][] {
  return (
    Array.isArray(value) &&
    value.length === size &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === size &&
        row.every((cell) => typeof cell === 'boolean'),
    )
  )
}

function isNullableFiniteGrid(
  value: unknown,
  size: number,
): value is (number | null)[][] {
  return (
    Array.isArray(value) &&
    value.length === size &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === size &&
        row.every((cell) => cell === null || isFiniteNumber(cell)),
    )
  )
}

function isWarning(value: unknown) {
  return (
    isRecord(value) &&
    warningCodes.has(String(value.code)) &&
    isNonEmptyString(value.message) &&
    isNonEmptyString(value.output_field)
  )
}

function hasExactStrings(value: unknown, expected: readonly string[]) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  )
}

export function isPandaFieldResult(value: unknown): value is PandaFieldResult {
  if (!isRecord(value) || !isPandaRequest(value.configuration)) {
    return false
  }

  const size = value.configuration.sampling.grid_points
  const manifest = value.model_manifest
  if (
    !isFiniteArray(value.x_coordinates_m, size) ||
    !isFiniteArray(value.y_coordinates_m, size) ||
    !isBooleanGrid(value.validity_mask, size) ||
    !isNullableFiniteGrid(
      value.normalized_deviatoric_difference_kernel,
      size,
    ) ||
    !isNullableFiniteGrid(value.normalized_shear_kernel, size) ||
    !isNullableFiniteGrid(value.normalized_principal_difference_kernel, size) ||
    !isNullableFiniteGrid(value.principal_axis_angle_rad, size) ||
    !isFiniteArray(value.sap_thermal_mismatch_strains, 2) ||
    !isFiniteNumber(value.kernel_scale) ||
    value.kernel_scale <= 0 ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every(isWarning) ||
    !isRecord(manifest) ||
    manifest.model_id !== 'panda_qualitative_far_field_kernel' ||
    manifest.model_version !== '1.0.0' ||
    manifest.method !== 'qualitative_far_field_kernel' ||
    manifest.quantity_type !== 'normalized_dimensionless_kernel' ||
    manifest.normalization !== 'max_valid_principal_difference' ||
    manifest.quantitative !== false ||
    manifest.units !== '1' ||
    !hasExactStrings(manifest.equation_references, equationReferences) ||
    !isStringArray(manifest.assumptions) ||
    !isStringArray(manifest.limitations) ||
    !isRecord(manifest.validity) ||
    manifest.validity.outside_cladding_masked !== true ||
    manifest.validity.sap_interiors_masked !== true ||
    !isFiniteNumber(manifest.validity.interface_buffer_m) ||
    manifest.validity.interface_buffer_m < 0 ||
    !isFiniteNumber(manifest.validity.valid_point_count) ||
    !Number.isInteger(manifest.validity.valid_point_count) ||
    Number(manifest.validity.valid_point_count) <= 0 ||
    manifest.validity.interface_buffer_m !==
      value.configuration.sampling.interface_buffer_m
  ) {
    return false
  }

  let validPointCount = 0
  for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < size; columnIndex += 1) {
      const valid = value.validity_mask[rowIndex][columnIndex]
      const deviatoric =
        value.normalized_deviatoric_difference_kernel[rowIndex][columnIndex]
      const shear = value.normalized_shear_kernel[rowIndex][columnIndex]
      const principal =
        value.normalized_principal_difference_kernel[rowIndex][columnIndex]
      const angle = value.principal_axis_angle_rad[rowIndex][columnIndex]

      if (!valid) {
        if (
          deviatoric !== null ||
          shear !== null ||
          principal !== null ||
          angle !== null
        ) {
          return false
        }
        continue
      }

      validPointCount += 1
      if (
        deviatoric === null ||
        shear === null ||
        principal === null ||
        deviatoric < -1 - NORMALIZED_TOLERANCE ||
        deviatoric > 1 + NORMALIZED_TOLERANCE ||
        shear < -1 - NORMALIZED_TOLERANCE ||
        shear > 1 + NORMALIZED_TOLERANCE ||
        principal < -NORMALIZED_TOLERANCE ||
        principal > 1 + NORMALIZED_TOLERANCE ||
        (principal <= NORMALIZED_TOLERANCE ? angle !== null : angle === null)
      ) {
        return false
      }
    }
  }

  return validPointCount === manifest.validity.valid_point_count
}

function jsonValuesMatch(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) {
    return true
  }
  if (Array.isArray(first) || Array.isArray(second)) {
    return (
      Array.isArray(first) &&
      Array.isArray(second) &&
      first.length === second.length &&
      first.every((entry, index) => jsonValuesMatch(entry, second[index]))
    )
  }
  if (!isRecord(first) || !isRecord(second)) {
    return false
  }
  const firstKeys = Object.keys(first).sort()
  const secondKeys = Object.keys(second).sort()
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every(
      (key, index) =>
        key === secondKeys[index] && jsonValuesMatch(first[key], second[key]),
    )
  )
}

export function pandaFieldRequestsMatch(
  first: PandaFieldRequest,
  second: PandaFieldRequest,
) {
  return jsonValuesMatch(first, second)
}
