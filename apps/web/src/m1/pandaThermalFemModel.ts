import type { operations } from '../../../../packages/shared_schemas/generated/api'

import {
  parsePandaGeometryValues,
  type PandaFieldFormValues,
} from './pandaFieldModel'
import { isPandaMeshResult } from './pandaMeshModel'

export type PandaThermalFemRequest =
  operations['calculate_panda_thermal_fem']['requestBody']['content']['application/json']
export type PandaThermalFemResult =
  operations['calculate_panda_thermal_fem']['responses'][200]['content']['application/json']

export type PandaThermalFemAxialCondition =
  PandaThermalFemRequest['axial_load']['condition']
export type PandaThermalFemRefinementLevel = 0 | 1 | 2
export type PandaThermalFemTorsionCapability = NonNullable<
  PandaThermalFemRequest['torsion']
>['capability']
export type PandaThermalFemTorsionInputMode = NonNullable<
  NonNullable<PandaThermalFemRequest['torsion']>['input_mode']
>
export type PandaThermalFemPhase =
  'idle' | 'loading' | 'ready' | 'validation' | 'error'

export type PandaThermalFemFieldName =
  | keyof PandaFieldFormValues
  | 'axialForceN'
  | 'prescribedStrainMicrostrain'
  | 'refinementLevel'
  | 'lateralPressureMPa'
  | 'wavelengthNm'
  | 'gaussianModeFieldRadiusUm'
  | 'torsionCapability'
  | 'torsionInputMode'
  | 'twistRatePerM'
  | 'appliedTorqueNm'

export type PandaThermalFemFieldErrors = Partial<
  Record<PandaThermalFemFieldName, string>
>

export type PandaThermalFemControls = {
  axialCondition: PandaThermalFemAxialCondition
  prescribedForceN: string
  prescribedStrainMicrostrain: string
  refinementLevel: PandaThermalFemRefinementLevel
  lateralPressureMPa: string
  wavelengthNm: string
  gaussianModeFieldRadiusUm: string
  torsionCapability: PandaThermalFemTorsionCapability
  torsionInputMode: PandaThermalFemTorsionInputMode
  twistRatePerM: string
  appliedTorqueNm: string
}

export type PandaThermalFemParseResult = {
  request: PandaThermalFemRequest | null
  fieldErrors: PandaThermalFemFieldErrors
}

export type PandaThermalFemController = {
  controls: PandaThermalFemControls
  result: PandaThermalFemResult | null
  phase: PandaThermalFemPhase
  statusLabel: string
  errorMessage: string | null
  fieldErrors: PandaThermalFemFieldErrors
  onAxialConditionChange: (condition: PandaThermalFemAxialCondition) => void
  onPrescribedForceChange: (value: string) => void
  onPrescribedStrainMicrostrainChange: (value: string) => void
  onRefinementLevelChange: (level: PandaThermalFemRefinementLevel) => void
  onLateralPressureMPaChange: (value: string) => void
  onWavelengthNmChange: (value: string) => void
  onGaussianModeFieldRadiusUmChange: (value: string) => void
  onTorsionCapabilityChange: (
    capability: PandaThermalFemTorsionCapability,
  ) => void
  onTorsionInputModeChange: (mode: PandaThermalFemTorsionInputMode) => void
  onTwistRatePerMChange: (value: string) => void
  onAppliedTorqueNmChange: (value: string) => void
  onImportControls: (controls: PandaThermalFemControls) => void
  onCalculate: () => void
  onRetry: () => void
}

export const initialPandaThermalFemControls: PandaThermalFemControls = {
  axialCondition: 'free_resultant',
  prescribedForceN: '0',
  prescribedStrainMicrostrain: '0',
  refinementLevel: 1,
  lateralPressureMPa: '0',
  wavelengthNm: '1550',
  gaussianModeFieldRadiusUm: '5',
  torsionCapability: 'none',
  torsionInputMode: 'twist_rate',
  twistRatePerM: '0',
  appliedTorqueNm: '0',
}

const femModelId = 'fem_generalized_plane_strain'
const femModelVersion = '1.2.0'
const femMethod = 'fem_generalized_plane_strain'
const femAxialConditions = new Set([
  'free_resultant',
  'prescribed_force',
  'prescribed_strain',
])
const torsionCapabilities = new Set([
  'none',
  'saint_venant_homogeneous_circular_reference',
])
const torsionInputModes = new Set(['twist_rate', 'applied_torque'])
const femWarningCodes = new Set([
  'demonstration_data',
  'convergence_unavailable',
  'convergence_above_threshold',
  'local_material_birefringence_convergence_above_threshold',
  'pressure_phase_birefringence_convergence_above_threshold',
])
const femStatuses = new Set(['unavailable', 'not_converged', 'converged'])
const modalAxisConvention =
  'state_1_is_unoriented_eigenaxis_closest_to_global_positive_x'
const modalMethod =
  'First-order scalar LP₀₁ photoelastic phase-birefringence estimate.'
const groupRequirements = [
  'wavelength-dependent material refractive indices',
  'wavelength-dependent photoelastic coefficients when relevant',
  'modal fields recalculated at each wavelength',
] as const
const shapeComparisonLimitations = [
  'the qualitative kernel has undefined sign and scale, so the best polarity is fitted',
  'this is a normalized shape comparison and not a stress error',
  'quantitative Eshelby error and birefringence error are unavailable',
] as const
const manifestAssumptions = [
  'small strain isotropic thermoelasticity',
  'generalized plane strain with uniform axial strain',
  'zero xz and yz shear strains',
  'piecewise constant material data per mesh element',
  'traction-free exterior with no imposed exterior displacement when pressure is zero',
  'positive pressure is lateral pressure acting directly on a bare fibre',
  'free axial resultant means that fibre ends are not pressure-loaded',
  'controlled rigid-body anchors only',
] as const
const manifestLimitations = [
  'material and thermal values may be demonstration data rather than measured fibre data',
  'first-order triangles provide a mesh-dependent approximation',
  'local material stress-optic birefringence is computed without modal propagation',
  'the scalar modal estimate is not a validated vector-mode solution',
  'modal phase birefringence is a first-order estimate',
  'moving-boundary and deformed-waveguide contributions are not included',
  'group birefringence needs wavelength-dependent material data and recalculated modal fields',
  'torsion is an analytical homogeneous circular benchmark and is not PANDA torsion',
  'demonstration material coefficients are not validated fibre measurements',
] as const
const pressureExclusions = [
  'coating mechanics are outside the model',
  'support contact is outside the model',
  'load transfer through packaging is outside the model',
] as const
const celsiusToKelvin = 273.15
const microCteToCte = 1e-6
const microstrainToStrain = 1e-6
const mpaToPa = 1e6
const nmToM = 1e-9
const umToM = 1e-6
const modalZeroTolerance = 1e-15

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isAngle(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -Math.PI / 2 && value < Math.PI / 2
}

function isPrincipalAngle(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -Math.PI / 2 && value <= Math.PI / 2
}

function isNullableAngle(value: unknown): value is number | null {
  return value === null || isAngle(value)
}

function isExactStringArray(
  value: unknown,
  expected: readonly string[],
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  )
}

function isFiniteArray(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(isFiniteNumber)
  )
}

function isNonNegativeArray(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(isNonNegativeNumber)
  )
}

function isNullableAngleArray(
  value: unknown,
  length: number,
): value is (number | null)[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(isNullableAngle)
  )
}

function isPrincipalAngleArray(
  value: unknown,
  length: number,
): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(isPrincipalAngle)
  )
}

function nearlyEqual(first: number, second: number, absoluteTolerance = 1e-15) {
  return (
    Math.abs(first - second) <=
    Math.max(
      absoluteTolerance,
      1e-9 * Math.max(Math.abs(first), Math.abs(second)),
    )
  )
}

function addError(
  fieldErrors: PandaThermalFemFieldErrors,
  field: PandaThermalFemFieldName,
  message: string,
) {
  fieldErrors[field] ??= message
}

function parseFiniteField(
  value: string,
  field: PandaThermalFemFieldName,
  fieldErrors: PandaThermalFemFieldErrors,
): number | null {
  const parsed = value.trim() === '' ? Number.NaN : Number(value)
  if (!Number.isFinite(parsed)) {
    addError(fieldErrors, field, 'Enter a finite number.')
    return null
  }
  return parsed
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

export function parsePandaThermalFemValues(
  values: PandaFieldFormValues,
  controls: PandaThermalFemControls = initialPandaThermalFemControls,
): PandaThermalFemParseResult {
  const fieldErrors: PandaThermalFemFieldErrors = {}
  const geometryResult = parsePandaGeometryValues(values)
  Object.assign(fieldErrors, geometryResult.fieldErrors)

  const cteFields = [
    'claddingCteMicroPerK',
    'sap1CteMicroPerK',
    'sap2CteMicroPerK',
  ] as const
  const cteValues = cteFields.map((field) =>
    parseFiniteField(values[field], field, fieldErrors),
  )
  const temperature = parseFiniteField(
    values.temperatureC,
    'temperatureC',
    fieldErrors,
  )
  const fictiveTemperature = parseFiniteField(
    values.fictiveTemperatureC,
    'fictiveTemperatureC',
    fieldErrors,
  )
  const pressureMpa = parseFiniteField(
    controls.lateralPressureMPa,
    'lateralPressureMPa',
    fieldErrors,
  )
  const wavelengthNm = parseFiniteField(
    controls.wavelengthNm,
    'wavelengthNm',
    fieldErrors,
  )
  const modeRadiusUm = parseFiniteField(
    controls.gaussianModeFieldRadiusUm,
    'gaussianModeFieldRadiusUm',
    fieldErrors,
  )

  if (temperature !== null && temperature <= -celsiusToKelvin) {
    addError(
      fieldErrors,
      'temperatureC',
      'Temperature must be above absolute zero.',
    )
  }
  if (fictiveTemperature !== null && fictiveTemperature <= -celsiusToKelvin) {
    addError(
      fieldErrors,
      'fictiveTemperatureC',
      'Effective fictive temperature must be above absolute zero.',
    )
  }
  if (pressureMpa !== null && pressureMpa < 0) {
    addError(
      fieldErrors,
      'lateralPressureMPa',
      'Pressure must be non-negative.',
    )
  }
  if (wavelengthNm !== null && wavelengthNm <= 0) {
    addError(fieldErrors, 'wavelengthNm', 'Wavelength must be positive.')
  }
  if (modeRadiusUm !== null && modeRadiusUm <= 0) {
    addError(
      fieldErrors,
      'gaussianModeFieldRadiusUm',
      'The Gaussian LP₀₁ field radius must be positive.',
    )
  }

  if (!femAxialConditions.has(controls.axialCondition)) {
    addError(fieldErrors, 'axialForceN', 'Choose a supported axial condition.')
  }
  if (
    controls.refinementLevel !== 0 &&
    controls.refinementLevel !== 1 &&
    controls.refinementLevel !== 2
  ) {
    addError(
      fieldErrors,
      'refinementLevel',
      'Refinement level must be 0, 1, or 2.',
    )
  }
  if (!torsionCapabilities.has(controls.torsionCapability)) {
    addError(
      fieldErrors,
      'torsionCapability',
      'Choose a supported torsion capability.',
    )
  }
  if (!torsionInputModes.has(controls.torsionInputMode)) {
    addError(
      fieldErrors,
      'torsionInputMode',
      'Choose a supported torsion input mode.',
    )
  }

  const axialValue =
    controls.axialCondition === 'prescribed_force'
      ? parseFiniteField(controls.prescribedForceN, 'axialForceN', fieldErrors)
      : null
  const strainValue =
    controls.axialCondition === 'prescribed_strain'
      ? parseFiniteField(
          controls.prescribedStrainMicrostrain,
          'prescribedStrainMicrostrain',
          fieldErrors,
        )
      : null
  const torsionValue =
    controls.torsionCapability === 'none'
      ? null
      : controls.torsionInputMode === 'twist_rate'
        ? parseFiniteField(controls.twistRatePerM, 'twistRatePerM', fieldErrors)
        : parseFiniteField(
            controls.appliedTorqueNm,
            'appliedTorqueNm',
            fieldErrors,
          )

  if (
    geometryResult.geometry === null ||
    cteValues.some((value) => value === null) ||
    temperature === null ||
    fictiveTemperature === null ||
    pressureMpa === null ||
    wavelengthNm === null ||
    modeRadiusUm === null ||
    (axialValue === null && controls.axialCondition === 'prescribed_force') ||
    (strainValue === null && controls.axialCondition === 'prescribed_strain') ||
    (torsionValue === null && controls.torsionCapability !== 'none') ||
    Object.keys(fieldErrors).length > 0
  ) {
    return { request: null, fieldErrors }
  }

  const [claddingCte, sap1Cte, sap2Cte] = cteValues as [number, number, number]
  const axialLoad: PandaThermalFemRequest['axial_load'] = {
    condition: controls.axialCondition,
    prescribed_force_n:
      controls.axialCondition === 'prescribed_force' ? axialValue : null,
    prescribed_strain:
      controls.axialCondition === 'prescribed_strain'
        ? (strainValue as number) * microstrainToStrain
        : null,
  }
  const torsion: PandaThermalFemRequest['torsion'] = {
    capability: controls.torsionCapability,
    input_mode:
      controls.torsionCapability === 'none' ? null : controls.torsionInputMode,
    twist_rate_per_m:
      controls.torsionCapability !== 'none' &&
      controls.torsionInputMode === 'twist_rate'
        ? torsionValue
        : null,
    applied_torque_n_m:
      controls.torsionCapability !== 'none' &&
      controls.torsionInputMode === 'applied_torque'
        ? torsionValue
        : null,
  }
  return {
    request: {
      geometry: geometryResult.geometry,
      materials: {
        core: demonstrationMaterial(
          'M1 UI demonstration core',
          claddingCte * microCteToCte,
        ),
        cladding: demonstrationMaterial(
          'M1 UI demonstration cladding',
          claddingCte * microCteToCte,
        ),
        sap_1: demonstrationMaterial(
          'M1 UI demonstration SAP 1',
          sap1Cte * microCteToCte,
        ),
        sap_2: demonstrationMaterial(
          'M1 UI demonstration SAP 2',
          sap2Cte * microCteToCte,
        ),
      },
      thermal: {
        temperature_k: temperature + celsiusToKelvin,
        effective_fictive_temperature_k: fictiveTemperature + celsiusToKelvin,
      },
      axial_load: axialLoad,
      lateral_pressure_pa: pressureMpa * mpaToPa,
      optical_mode: {
        wavelength_m: wavelengthNm * nmToM,
        gaussian_mode_field_radius_m: modeRadiusUm * umToM,
      },
      torsion,
      refinement_level: controls.refinementLevel,
    },
    fieldErrors,
  }
}

function isMaterialSource(value: unknown): boolean {
  return (
    hasExactKeys(value, ['citation', 'confidence', 'notes', 'source_date']) &&
    isNonEmptyString(value.citation) &&
    (value.confidence === 'measured_sample' ||
      value.confidence === 'manufacturer' ||
      value.confidence === 'literature_composition' ||
      value.confidence === 'calibrated_effective' ||
      value.confidence === 'demonstration_only') &&
    (value.source_date === null || typeof value.source_date === 'string') &&
    typeof value.notes === 'string'
  )
}

function isPandaMaterial(value: unknown): boolean {
  if (
    !hasExactKeys(value, [
      'c1_per_pa',
      'c2_per_pa',
      'composition',
      'cte_per_k',
      'name',
      'p11',
      'p12',
      'photoelastic_convention',
      'poisson_ratio',
      'refractive_index',
      'source',
      'young_modulus_pa',
    ]) ||
    !isNonEmptyString(value.name) ||
    !(value.composition === null || typeof value.composition === 'string') ||
    !isPositiveNumber(value.young_modulus_pa) ||
    !isFiniteNumber(value.poisson_ratio) ||
    value.poisson_ratio <= -1 ||
    value.poisson_ratio >= 0.5 ||
    !isFiniteNumber(value.cte_per_k) ||
    !isPositiveNumber(value.refractive_index) ||
    !(value.p11 === null || isFiniteNumber(value.p11)) ||
    !(value.p12 === null || isFiniteNumber(value.p12)) ||
    !(value.c1_per_pa === null || isFiniteNumber(value.c1_per_pa)) ||
    !(value.c2_per_pa === null || isFiniteNumber(value.c2_per_pa)) ||
    !isMaterialSource(value.source)
  ) {
    return false
  }
  return value.photoelastic_convention === 'p11_p12_strain'
    ? isFiniteNumber(value.p11) &&
        isFiniteNumber(value.p12) &&
        value.c1_per_pa === null &&
        value.c2_per_pa === null
    : value.photoelastic_convention === 'c1_c2_stress_optic' &&
        value.p11 === null &&
        value.p12 === null &&
        isFiniteNumber(value.c1_per_pa) &&
        isFiniteNumber(value.c2_per_pa)
}

type GeometrySap = {
  center_x_m: number
  center_y_m: number
  radius_m: number
}

type GeometryRecord = {
  cladding_radius_m: number
  core_center_x_m: number
  core_center_y_m: number
  core_radius_m: number
  sap_1: GeometrySap
  sap_2: GeometrySap
}

function isGeometry(value: unknown): value is GeometryRecord {
  if (
    !hasExactKeys(value, [
      'cladding_radius_m',
      'core_center_x_m',
      'core_radius_m',
      'core_center_y_m',
      'sap_1',
      'sap_2',
    ])
  ) {
    return false
  }
  const isSap = (sap: unknown): sap is GeometrySap =>
    hasExactKeys(sap, ['center_x_m', 'center_y_m', 'radius_m']) &&
    isPositiveNumber(sap.radius_m) &&
    isFiniteNumber(sap.center_x_m) &&
    isFiniteNumber(sap.center_y_m)
  if (
    !isPositiveNumber(value.core_radius_m) ||
    !isPositiveNumber(value.cladding_radius_m) ||
    !isFiniteNumber(value.core_center_x_m) ||
    !isFiniteNumber(value.core_center_y_m) ||
    !isSap(value.sap_1) ||
    !isSap(value.sap_2) ||
    value.core_radius_m >= value.cladding_radius_m
  ) {
    return false
  }
  const coreRadius = value.core_radius_m as number
  const claddingRadius = value.cladding_radius_m as number
  const coreCenterX = value.core_center_x_m as number
  const coreCenterY = value.core_center_y_m as number
  const sap1 = value.sap_1 as GeometrySap
  const sap2 = value.sap_2 as GeometrySap
  if (Math.hypot(coreCenterX, coreCenterY) + coreRadius > claddingRadius) {
    return false
  }
  const saps = [sap1, sap2]
  if (
    saps.some(
      (sap) =>
        Math.hypot(sap.center_x_m, sap.center_y_m) + sap.radius_m >
          claddingRadius ||
        Math.hypot(sap.center_x_m - coreCenterX, sap.center_y_m - coreCenterY) <
          sap.radius_m + coreRadius,
    )
  ) {
    return false
  }
  return (
    Math.hypot(
      sap1.center_x_m - sap2.center_x_m,
      sap1.center_y_m - sap2.center_y_m,
    ) >=
    sap1.radius_m + sap2.radius_m
  )
}

function isAxialLoad(value: unknown): boolean {
  if (
    !hasExactKeys(value, [
      'condition',
      'prescribed_force_n',
      'prescribed_strain',
    ]) ||
    !femAxialConditions.has(String(value.condition)) ||
    !isNullableFiniteNumber(value.prescribed_force_n) ||
    !isNullableFiniteNumber(value.prescribed_strain)
  ) {
    return false
  }
  if (value.condition === 'free_resultant') {
    return value.prescribed_force_n === null && value.prescribed_strain === null
  }
  if (value.condition === 'prescribed_force') {
    return value.prescribed_force_n !== null && value.prescribed_strain === null
  }
  return value.prescribed_force_n === null && value.prescribed_strain !== null
}

function isOpticalMode(value: unknown): boolean {
  return (
    hasExactKeys(value, ['gaussian_mode_field_radius_m', 'wavelength_m']) &&
    isPositiveNumber(value.wavelength_m) &&
    isPositiveNumber(value.gaussian_mode_field_radius_m)
  )
}

function isTorsionRequest(value: unknown): boolean {
  if (
    !hasExactKeys(value, [
      'applied_torque_n_m',
      'capability',
      'input_mode',
      'twist_rate_per_m',
    ]) ||
    !torsionCapabilities.has(String(value.capability)) ||
    !(
      value.input_mode === null ||
      torsionInputModes.has(String(value.input_mode))
    ) ||
    !isNullableFiniteNumber(value.twist_rate_per_m) ||
    !isNullableFiniteNumber(value.applied_torque_n_m)
  ) {
    return false
  }
  if (value.capability === 'none') {
    return (
      value.input_mode === null &&
      value.twist_rate_per_m === null &&
      value.applied_torque_n_m === null
    )
  }
  if (value.input_mode === 'twist_rate') {
    return value.twist_rate_per_m !== null && value.applied_torque_n_m === null
  }
  return (
    value.input_mode === 'applied_torque' &&
    value.twist_rate_per_m === null &&
    value.applied_torque_n_m !== null
  )
}

function isThermalRequest(value: unknown): value is PandaThermalFemRequest {
  return (
    hasExactKeys(value, [
      'axial_load',
      'geometry',
      'lateral_pressure_pa',
      'materials',
      'optical_mode',
      'refinement_level',
      'thermal',
      'torsion',
    ]) &&
    isGeometry(value.geometry) &&
    isRecord(value.materials) &&
    hasExactKeys(value.materials, ['cladding', 'core', 'sap_1', 'sap_2']) &&
    isPandaMaterial(value.materials.core) &&
    isPandaMaterial(value.materials.cladding) &&
    isPandaMaterial(value.materials.sap_1) &&
    isPandaMaterial(value.materials.sap_2) &&
    isRecord(value.thermal) &&
    hasExactKeys(value.thermal, [
      'effective_fictive_temperature_k',
      'temperature_k',
    ]) &&
    isPositiveNumber(value.thermal.temperature_k) &&
    isPositiveNumber(value.thermal.effective_fictive_temperature_k) &&
    isAxialLoad(value.axial_load) &&
    isNonNegativeNumber(value.lateral_pressure_pa) &&
    isOpticalMode(value.optical_mode) &&
    isTorsionRequest(value.torsion) &&
    isInteger(value.refinement_level) &&
    value.refinement_level >= 0 &&
    value.refinement_level <= 2
  )
}

function isCoreSummary(value: unknown): boolean {
  if (
    !hasExactKeys(value, [
      'area_m2',
      'average_stress_xx_pa',
      'average_stress_xy_pa',
      'average_stress_yy_pa',
      'average_stress_zz_pa',
      'local_material_birefringence',
      'local_material_slow_axis_angle_rad',
      'principal_axis_angle_rad',
      'principal_difference_pa',
      'principal_max_pa',
      'principal_min_pa',
      'signed_local_material_birefringence',
      'stress_optic_coefficient_per_pa',
    ])
  ) {
    return false
  }
  return (
    isPositiveNumber(value.area_m2) &&
    [
      value.average_stress_xx_pa,
      value.average_stress_xy_pa,
      value.average_stress_yy_pa,
      value.average_stress_zz_pa,
      value.principal_axis_angle_rad,
      value.principal_max_pa,
      value.principal_min_pa,
      value.signed_local_material_birefringence,
      value.stress_optic_coefficient_per_pa,
    ].every(isFiniteNumber) &&
    isPrincipalAngle(value.principal_axis_angle_rad) &&
    isNonNegativeNumber(value.principal_difference_pa) &&
    isNonNegativeNumber(value.local_material_birefringence) &&
    isNullableAngle(value.local_material_slow_axis_angle_rad)
  )
}

function isStressSummary(value: unknown): boolean {
  return (
    hasExactKeys(value, [
      'area_m2',
      'average_stress_xx_pa',
      'average_stress_xy_pa',
      'average_stress_yy_pa',
      'average_stress_zz_pa',
      'principal_axis_angle_rad',
      'principal_difference_pa',
    ]) &&
    isPositiveNumber(value.area_m2) &&
    [
      value.average_stress_xx_pa,
      value.average_stress_xy_pa,
      value.average_stress_yy_pa,
      value.average_stress_zz_pa,
      value.principal_axis_angle_rad,
    ].every(isFiniteNumber) &&
    isPrincipalAngle(value.principal_axis_angle_rad) &&
    isNonNegativeNumber(value.principal_difference_pa)
  )
}

function isAnchorReactions(value: unknown, nodeCount: number): boolean {
  return (
    hasExactKeys(value, [
      'primary_node_index',
      'primary_reaction_x_n_per_m',
      'primary_reaction_y_n_per_m',
      'secondary_node_index',
      'secondary_reaction_x_n_per_m',
      'secondary_reaction_y_n_per_m',
    ]) &&
    isNonNegativeInteger(value.primary_node_index) &&
    value.primary_node_index < nodeCount &&
    isNonNegativeInteger(value.secondary_node_index) &&
    value.secondary_node_index < nodeCount &&
    value.primary_node_index !== value.secondary_node_index &&
    [
      value.primary_reaction_x_n_per_m,
      value.primary_reaction_y_n_per_m,
      value.secondary_reaction_x_n_per_m,
      value.secondary_reaction_y_n_per_m,
    ].every(isFiniteNumber)
  )
}

function isForceBalance(value: unknown, condition: string): boolean {
  if (
    !hasExactKeys(value, [
      'axial_residual_n',
      'axial_resultant_n',
      'axial_target_n',
      'transverse_free_residual_l2_n_per_m',
      'transverse_resultant_x_n_per_m',
      'transverse_resultant_y_n_per_m',
    ]) ||
    !isNonNegativeNumber(value.transverse_free_residual_l2_n_per_m) ||
    !isFiniteNumber(value.transverse_resultant_x_n_per_m) ||
    !isFiniteNumber(value.transverse_resultant_y_n_per_m) ||
    !isFiniteNumber(value.axial_resultant_n)
  ) {
    return false
  }
  if (condition === 'prescribed_strain') {
    return value.axial_target_n === null && value.axial_residual_n === null
  }
  return (
    isFiniteNumber(value.axial_target_n) &&
    isFiniteNumber(value.axial_residual_n)
  )
}

function isModalEstimate(value: unknown, wavelengthM: number): boolean {
  if (
    !hasExactKeys(value, [
      'beat_length_m',
      'beat_length_status',
      'common_index_shift',
      'eigenvalue_shifts',
      'perturbation_matrix',
      'phase_birefringence_magnitude',
      'signed_convention',
      'signed_delta_beta_per_m',
      'signed_phase_birefringence',
      'slow_axis_angle_rad',
      'state_1_axis_angle_rad',
      'state_1_index_shift',
      'state_2_axis_angle_rad',
      'state_2_index_shift',
    ]) ||
    !isFiniteNumber(value.state_1_index_shift) ||
    !isFiniteNumber(value.state_2_index_shift) ||
    !isFiniteNumber(value.common_index_shift) ||
    !isFiniteNumber(value.signed_phase_birefringence) ||
    !isNonNegativeNumber(value.phase_birefringence_magnitude) ||
    !isFiniteNumber(value.signed_delta_beta_per_m) ||
    value.signed_convention !== modalAxisConvention ||
    !isNullableAngle(value.state_1_axis_angle_rad) ||
    !isNullableAngle(value.state_2_axis_angle_rad) ||
    !isNullableAngle(value.slow_axis_angle_rad) ||
    !Array.isArray(value.eigenvalue_shifts) ||
    value.eigenvalue_shifts.length !== 2 ||
    !value.eigenvalue_shifts.every(isFiniteNumber) ||
    !Array.isArray(value.perturbation_matrix) ||
    value.perturbation_matrix.length !== 2 ||
    !value.perturbation_matrix.every(
      (row) =>
        Array.isArray(row) && row.length === 2 && row.every(isFiniteNumber),
    ) ||
    value.perturbation_matrix[0][1] !== value.perturbation_matrix[1][0]
  ) {
    return false
  }
  const state1 = value.state_1_index_shift as number
  const state2 = value.state_2_index_shift as number
  const signed = value.signed_phase_birefringence as number
  const magnitude = value.phase_birefringence_magnitude as number
  const matrix = value.perturbation_matrix as [
    [number, number],
    [number, number],
  ]
  const eigenvalues = value.eigenvalue_shifts as [number, number]
  const matrixMean = 0.5 * (matrix[0][0] + matrix[1][1])
  const matrixRadius = Math.hypot(
    0.5 * (matrix[0][0] - matrix[1][1]),
    matrix[0][1],
  )
  const expectedLow = matrixMean - matrixRadius
  const expectedHigh = matrixMean + matrixRadius
  const stateOrderIsValid =
    (nearlyEqual(state1, expectedLow) && nearlyEqual(state2, expectedHigh)) ||
    (nearlyEqual(state1, expectedHigh) && nearlyEqual(state2, expectedLow))
  if (
    !stateOrderIsValid ||
    !nearlyEqual(eigenvalues[0], expectedLow) ||
    !nearlyEqual(eigenvalues[1], expectedHigh) ||
    !nearlyEqual(value.common_index_shift as number, 0.5 * (state1 + state2)) ||
    !nearlyEqual(signed, state1 - state2) ||
    !nearlyEqual(magnitude, Math.abs(signed)) ||
    !nearlyEqual(
      value.signed_delta_beta_per_m as number,
      ((2 * Math.PI) / wavelengthM) * signed,
    )
  ) {
    return false
  }
  if (magnitude <= modalZeroTolerance) {
    return (
      value.beat_length_status === 'undefined within numerical tolerance' &&
      value.beat_length_m === null &&
      value.state_1_axis_angle_rad === null &&
      value.state_2_axis_angle_rad === null &&
      value.slow_axis_angle_rad === null
    )
  }
  return (
    value.beat_length_status === 'finite' &&
    isPositiveNumber(value.beat_length_m) &&
    nearlyEqual(value.beat_length_m, wavelengthM / magnitude) &&
    value.state_1_axis_angle_rad !== null &&
    value.state_2_axis_angle_rad !== null &&
    value.slow_axis_angle_rad !== null
  )
}

function isGroupBirefringence(value: unknown): boolean {
  return (
    hasExactKeys(value, ['available', 'reason', 'requirements', 'value']) &&
    value.available === false &&
    value.value === null &&
    value.reason === 'wavelength_dependent_inputs_unavailable' &&
    isExactStringArray(value.requirements, groupRequirements)
  )
}

function isOpticalBirefringence(value: unknown, wavelengthM: number): boolean {
  return (
    hasExactKeys(value, [
      'group_birefringence',
      'method',
      'moving_boundary_or_deformed_waveguide_included',
      'pressure_induced',
      'scalar_weak_guidance_estimate',
      'total_combined',
      'validated_vector_mode_solution',
      'zero_pressure_residual',
    ]) &&
    value.method === modalMethod &&
    value.scalar_weak_guidance_estimate === true &&
    value.validated_vector_mode_solution === false &&
    value.moving_boundary_or_deformed_waveguide_included === false &&
    isModalEstimate(value.zero_pressure_residual, wavelengthM) &&
    isModalEstimate(value.total_combined, wavelengthM) &&
    isModalEstimate(value.pressure_induced, wavelengthM) &&
    isGroupBirefringence(value.group_birefringence)
  )
}

function isTorsionResult(
  value: unknown,
  elementCount: number,
  request: PandaThermalFemRequest['torsion'],
): boolean {
  if (
    !hasExactKeys(value, [
      'analytical_mechanics_benchmark_only',
      'applied_torque_n_m',
      'capability',
      'element_centroid_stress_xz_pa',
      'element_centroid_stress_yz_pa',
      'heterogeneous_panda_torsion',
      'input_mode',
      'maximum_boundary_shear_pa',
      'polar_moment_m4',
      'polarization_coupling_included',
      'reference_radius_m',
      'shear_modulus_pa',
      'twist_rate_per_m',
      'used_in_transverse_scalar_optical_model',
    ]) ||
    value.capability !== request?.capability ||
    value.analytical_mechanics_benchmark_only !== true ||
    value.heterogeneous_panda_torsion !== false ||
    value.polarization_coupling_included !== false ||
    value.used_in_transverse_scalar_optical_model !== false ||
    !isFiniteArray(value.element_centroid_stress_xz_pa, elementCount) ||
    !isFiniteArray(value.element_centroid_stress_yz_pa, elementCount) ||
    !isFiniteNumber(value.applied_torque_n_m) ||
    !isNonNegativeNumber(value.maximum_boundary_shear_pa) ||
    !isPositiveNumber(value.polar_moment_m4) ||
    !isPositiveNumber(value.reference_radius_m) ||
    !isPositiveNumber(value.shear_modulus_pa) ||
    !isFiniteNumber(value.twist_rate_per_m)
  ) {
    return false
  }
  const xz = value.element_centroid_stress_xz_pa as number[]
  const yz = value.element_centroid_stress_yz_pa as number[]
  if (request?.capability === 'none') {
    return (
      value.input_mode === null &&
      value.twist_rate_per_m === 0 &&
      value.applied_torque_n_m === 0 &&
      value.maximum_boundary_shear_pa === 0 &&
      xz.every((entry) => entry === 0) &&
      yz.every((entry) => entry === 0)
    )
  }
  const expectedTorque =
    (value.shear_modulus_pa as number) *
    (value.polar_moment_m4 as number) *
    (value.twist_rate_per_m as number)
  const expectedMaximum = Math.abs(
    (value.shear_modulus_pa as number) *
      (value.twist_rate_per_m as number) *
      (value.reference_radius_m as number),
  )
  return (
    value.input_mode === request?.input_mode &&
    nearlyEqual(value.applied_torque_n_m as number, expectedTorque) &&
    nearlyEqual(value.maximum_boundary_shear_pa as number, expectedMaximum) &&
    (request?.input_mode === 'twist_rate'
      ? nearlyEqual(
          value.twist_rate_per_m as number,
          request.twist_rate_per_m as number,
        )
      : nearlyEqual(
          value.applied_torque_n_m as number,
          request?.applied_torque_n_m as number,
        ))
  )
}

function isConvergence(
  value: unknown,
  refinementLevel: number,
): value is PandaThermalFemResult['convergence'] {
  if (!Array.isArray(value) || value.length !== refinementLevel + 1)
    return false
  return value.every((entry, index) => {
    if (
      !hasExactKeys(entry, [
        'core_average_local_material_birefringence',
        'core_average_principal_difference_pa',
        'element_count',
        'local_material_birefringence_relative_change',
        'local_material_birefringence_status',
        'node_count',
        'pressure_induced_phase_birefringence',
        'pressure_induced_phase_birefringence_relative_change',
        'pressure_induced_phase_birefringence_status',
        'refinement_level',
        'relative_change',
        'status',
      ]) ||
      entry.refinement_level !== index ||
      !isInteger(entry.node_count) ||
      entry.node_count <= 0 ||
      !isInteger(entry.element_count) ||
      entry.element_count <= 0 ||
      !isNonNegativeNumber(entry.core_average_principal_difference_pa) ||
      !isNonNegativeNumber(entry.core_average_local_material_birefringence) ||
      !femStatuses.has(String(entry.local_material_birefringence_status)) ||
      !femStatuses.has(
        String(entry.pressure_induced_phase_birefringence_status),
      ) ||
      !femStatuses.has(String(entry.status)) ||
      !isNonNegativeNumber(entry.pressure_induced_phase_birefringence)
    ) {
      return false
    }
    return index === 0
      ? entry.relative_change === null &&
          entry.status === 'unavailable' &&
          entry.local_material_birefringence_relative_change === null &&
          entry.local_material_birefringence_status === 'unavailable' &&
          entry.pressure_induced_phase_birefringence_relative_change === null &&
          entry.pressure_induced_phase_birefringence_status === 'unavailable'
      : isNonNegativeNumber(entry.relative_change) &&
          entry.status !== 'unavailable' &&
          isNonNegativeNumber(
            entry.local_material_birefringence_relative_change,
          ) &&
          entry.local_material_birefringence_status !== 'unavailable' &&
          isNonNegativeNumber(
            entry.pressure_induced_phase_birefringence_relative_change,
          ) &&
          entry.pressure_induced_phase_birefringence_status !== 'unavailable'
  })
}

function isWarning(value: unknown): boolean {
  return (
    hasExactKeys(value, ['code', 'message', 'refinement_level']) &&
    typeof value.code === 'string' &&
    femWarningCodes.has(value.code) &&
    isNonEmptyString(value.message) &&
    (value.refinement_level === null ||
      (isNonNegativeInteger(value.refinement_level) &&
        value.refinement_level <= 2))
  )
}

function isManifest(value: unknown): boolean {
  if (
    !hasExactKeys(value, [
      'assumptions',
      'axial_conditions',
      'axial_equation',
      'axial_strain_model',
      'birefringence_computed',
      'birefringence_quantity',
      'birefringence_scope',
      'birefringence_units',
      'displacement_units',
      'element_family',
      'equation',
      'equation_references',
      'exterior_boundary_model',
      'free_resultant_scope',
      'group_birefringence',
      'hydrostatic_end_face_loading',
      'hydrostatic_limitation',
      'limitations',
      'local_not_modal',
      'method',
      'modal_phase_estimate_computed',
      'modal_phase_estimate_method',
      'model_id',
      'model_version',
      'moving_boundary_contribution',
      'optical_mode_model',
      'optical_perturbation_matrix',
      'pressure_boundary_model',
      'pressure_exclusions',
      'pressure_scope',
      'pressure_sign_convention',
      'pressure_units',
      'quantity_type',
      'strain_units',
      'stress_measure',
      'stress_optic_coefficient_units',
      'stress_units',
      'thermal_strain_model',
      'torsion_capabilities',
      'vector_mode_validation',
    ])
  ) {
    return false
  }
  return (
    value.model_id === femModelId &&
    value.model_version === femModelVersion &&
    value.method === femMethod &&
    value.stress_measure === 'cauchy_stress' &&
    value.quantity_type === 'quantitative_mechanical_output' &&
    value.stress_units === 'Pa' &&
    value.displacement_units === 'm' &&
    value.strain_units === '1' &&
    value.exterior_boundary_model ===
      'traction_free_at_zero_pressure_or_prescribed_bare_glass_lateral_pressure' &&
    value.element_family === 'first_order_triangles' &&
    value.axial_strain_model === 'uniform_epsilon_zz_0' &&
    value.equation === 'transverse_weak_equilibrium_plus_axial_resultant' &&
    value.axial_equation === 'integral_sigma_zz_d_a_equals_n_z' &&
    value.thermal_strain_model === 'full_per_region_alpha_delta_t' &&
    value.birefringence_computed === true &&
    value.birefringence_scope ===
      'local_material_and_first_order_scalar_lp01_phase' &&
    value.birefringence_quantity ===
      'signed_local_and_modal_phase_index_differences' &&
    value.birefringence_units === '1' &&
    value.stress_optic_coefficient_units === 'Pa^-1' &&
    value.local_not_modal === true &&
    value.modal_phase_estimate_computed === true &&
    value.modal_phase_estimate_method === modalMethod &&
    value.pressure_boundary_model ===
      'bare_glass_lateral_pressure_when_requested' &&
    value.pressure_units === 'Pa' &&
    value.pressure_sign_convention === 'sigma_n_equals_minus_p_n' &&
    value.pressure_scope === 'uncoated_outer_glass_boundary' &&
    value.free_resultant_scope === 'ends_not_pressure_loaded' &&
    value.hydrostatic_end_face_loading ===
      'requires_changed_axial_loading_condition' &&
    value.hydrostatic_limitation ===
      'pressure_on_end_faces_requires_changing_the_axial_loading_condition' &&
    value.optical_mode_model ===
      'degenerate_gaussian_lp01_scalar_weak_guidance' &&
    value.optical_perturbation_matrix === 'real_symmetric_2x2_hermitian' &&
    value.moving_boundary_contribution === 'not_included' &&
    value.vector_mode_validation === 'not_validated' &&
    value.group_birefringence === 'unavailable_single_wavelength' &&
    isExactStringArray(value.axial_conditions, [
      'free_resultant',
      'prescribed_force',
      'prescribed_strain',
    ]) &&
    isExactStringArray(value.torsion_capabilities, [
      'none',
      'saint_venant_homogeneous_circular_reference',
    ]) &&
    isExactStringArray(value.equation_references, [
      'M1-6.9',
      'M1-6.10',
      'M1-6.11',
      'M1-6.12',
      'M1-7.3',
      'M1-7.5',
      'M1-8.1',
      'M1-8.2',
      'M1-8.3',
      'M1-8.4',
    ]) &&
    isExactStringArray(value.assumptions, manifestAssumptions) &&
    isExactStringArray(value.limitations, manifestLimitations) &&
    isExactStringArray(value.pressure_exclusions, pressureExclusions)
  )
}

function isShapeComparison(value: unknown): boolean {
  if (
    !hasExactKeys(value, [
      'available',
      'best_polarity',
      'correlation',
      'domain',
      'fem_signed_deviatoric_stress_scale_pa',
      'kernel_scale',
      'limitations',
      'model_id',
      'quantitative',
      'rmse',
      'sample_count',
      'sign_agreement',
      'unavailable_reason',
      'units',
    ])
  ) {
    return false
  }
  if (
    value.model_id !== 'qualitative_kernel_fem_shape_comparison' ||
    value.quantitative !== false ||
    value.units !== '1' ||
    value.domain !== 'core_elements' ||
    !isStrictBoolean(value.available) ||
    !isNonNegativeInteger(value.sample_count) ||
    !isExactStringArray(value.limitations, shapeComparisonLimitations) ||
    !(
      value.best_polarity === null ||
      value.best_polarity === -1 ||
      value.best_polarity === 1
    ) ||
    !(value.kernel_scale === null || isNonNegativeNumber(value.kernel_scale)) ||
    !(
      value.fem_signed_deviatoric_stress_scale_pa === null ||
      isNonNegativeNumber(value.fem_signed_deviatoric_stress_scale_pa)
    ) ||
    !(
      value.unavailable_reason === null ||
      value.unavailable_reason === 'insufficient_core_elements' ||
      value.unavailable_reason === 'zero_or_nonfinite_scale' ||
      value.unavailable_reason === 'nonfinite_metric'
    )
  ) {
    return false
  }
  if (!value.available) {
    return (
      value.best_polarity === null &&
      value.rmse === null &&
      value.correlation === null &&
      value.sign_agreement === null &&
      value.unavailable_reason !== null
    )
  }
  return (
    value.sample_count >= 2 &&
    isPositiveNumber(value.kernel_scale) &&
    isPositiveNumber(value.fem_signed_deviatoric_stress_scale_pa) &&
    (value.best_polarity === -1 || value.best_polarity === 1) &&
    isNonNegativeNumber(value.rmse) &&
    value.rmse <= 2 &&
    (value.correlation === null ||
      (isFiniteNumber(value.correlation) &&
        value.correlation >= -1 &&
        value.correlation <= 1)) &&
    isNonNegativeNumber(value.sign_agreement) &&
    value.sign_agreement <= 1 &&
    value.unavailable_reason === null
  )
}

function isStrictBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isThermalFemResult(value: unknown): value is PandaThermalFemResult {
  if (
    !hasExactKeys(value, [
      'anchor_reactions',
      'baseline_core_summary',
      'configuration',
      'convergence',
      'core_summary',
      'displacement_x_m',
      'displacement_y_m',
      'element_local_material_birefringence',
      'element_local_material_slow_axis_angle_rad',
      'element_pressure_increment_stress_xx_pa',
      'element_pressure_increment_stress_xy_pa',
      'element_pressure_increment_stress_yy_pa',
      'element_pressure_increment_stress_zz_pa',
      'element_principal_axis_angle_rad',
      'element_principal_difference_pa',
      'element_principal_max_pa',
      'element_principal_min_pa',
      'element_signed_local_material_birefringence',
      'element_strain_xx',
      'element_strain_xy',
      'element_strain_yy',
      'element_strain_zz',
      'element_stress_optic_coefficient_per_pa',
      'element_stress_xx_pa',
      'element_stress_xy_pa',
      'element_stress_yy_pa',
      'element_stress_zz_pa',
      'epsilon_zz_0',
      'force_balance',
      'mesh',
      'model_manifest',
      'optical_birefringence',
      'pressure_increment_core_summary',
      'qualitative_kernel_fem_shape_comparison',
      'torsion',
      'warnings',
    ]) ||
    !isThermalRequest(value.configuration) ||
    !isPandaMeshResult(value.mesh) ||
    !isCoreSummary(value.core_summary) ||
    !isStressSummary(value.baseline_core_summary) ||
    !isStressSummary(value.pressure_increment_core_summary) ||
    !isAnchorReactions(value.anchor_reactions, value.mesh.node_count) ||
    !isForceBalance(
      value.force_balance,
      value.configuration.axial_load.condition,
    ) ||
    !isFiniteNumber(value.epsilon_zz_0) ||
    !isManifest(value.model_manifest) ||
    !isOpticalBirefringence(
      value.optical_birefringence,
      value.configuration.optical_mode!.wavelength_m,
    ) ||
    !isTorsionResult(
      value.torsion,
      value.mesh.element_count,
      value.configuration.torsion,
    ) ||
    !isShapeComparison(value.qualitative_kernel_fem_shape_comparison) ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every(isWarning) ||
    !isFiniteArray(value.displacement_x_m, value.mesh.node_count) ||
    !isFiniteArray(value.displacement_y_m, value.mesh.node_count) ||
    !isFiniteArray(value.element_strain_xx, value.mesh.element_count) ||
    !isFiniteArray(value.element_strain_yy, value.mesh.element_count) ||
    !isFiniteArray(value.element_strain_zz, value.mesh.element_count) ||
    !isFiniteArray(value.element_strain_xy, value.mesh.element_count) ||
    !isFiniteArray(value.element_stress_xx_pa, value.mesh.element_count) ||
    !isFiniteArray(value.element_stress_yy_pa, value.mesh.element_count) ||
    !isFiniteArray(value.element_stress_zz_pa, value.mesh.element_count) ||
    !isFiniteArray(value.element_stress_xy_pa, value.mesh.element_count) ||
    !isFiniteArray(
      value.element_pressure_increment_stress_xx_pa,
      value.mesh.element_count,
    ) ||
    !isFiniteArray(
      value.element_pressure_increment_stress_yy_pa,
      value.mesh.element_count,
    ) ||
    !isFiniteArray(
      value.element_pressure_increment_stress_zz_pa,
      value.mesh.element_count,
    ) ||
    !isFiniteArray(
      value.element_pressure_increment_stress_xy_pa,
      value.mesh.element_count,
    ) ||
    !isFiniteArray(
      value.element_stress_optic_coefficient_per_pa,
      value.mesh.element_count,
    ) ||
    !isFiniteArray(value.element_principal_max_pa, value.mesh.element_count) ||
    !isFiniteArray(value.element_principal_min_pa, value.mesh.element_count) ||
    !isNonNegativeArray(
      value.element_principal_difference_pa,
      value.mesh.element_count,
    ) ||
    !isPrincipalAngleArray(
      value.element_principal_axis_angle_rad,
      value.mesh.element_count,
    ) ||
    !isFiniteArray(
      value.element_signed_local_material_birefringence,
      value.mesh.element_count,
    ) ||
    !isNonNegativeArray(
      value.element_local_material_birefringence,
      value.mesh.element_count,
    ) ||
    !isNullableAngleArray(
      value.element_local_material_slow_axis_angle_rad,
      value.mesh.element_count,
    ) ||
    !isConvergence(value.convergence, value.configuration.refinement_level)
  ) {
    return false
  }
  const result = value as PandaThermalFemResult
  const selectedConvergence = result.convergence[result.convergence.length - 1]
  const optical = result.optical_birefringence
  const modalMatricesAdd = [0, 1].every((row) =>
    [0, 1].every((column) =>
      nearlyEqual(
        optical.total_combined.perturbation_matrix[row][column],
        optical.zero_pressure_residual.perturbation_matrix[row][column] +
          optical.pressure_induced.perturbation_matrix[row][column],
      ),
    ),
  )
  const zeroPressureIncrementIsZero =
    result.configuration.lateral_pressure_pa !== 0 ||
    (result.element_pressure_increment_stress_xx_pa.every(
      (entry) => entry === 0,
    ) &&
      result.element_pressure_increment_stress_yy_pa.every(
        (entry) => entry === 0,
      ) &&
      result.element_pressure_increment_stress_zz_pa.every(
        (entry) => entry === 0,
      ) &&
      result.element_pressure_increment_stress_xy_pa.every(
        (entry) => entry === 0,
      ) &&
      optical.pressure_induced.phase_birefringence_magnitude <=
        modalZeroTolerance &&
      result.pressure_increment_core_summary.principal_difference_pa <=
        modalZeroTolerance)
  return (
    selectedConvergence.node_count === result.mesh.node_count &&
    selectedConvergence.element_count === result.mesh.element_count &&
    modalMatricesAdd &&
    zeroPressureIncrementIsZero &&
    jsonValuesMatch(
      result.configuration.geometry,
      result.mesh.configuration.geometry,
    ) &&
    result.configuration.refinement_level ===
      result.mesh.configuration.refinement_level
  )
}

export function isPandaThermalFemResult(
  value: unknown,
): value is PandaThermalFemResult {
  return isThermalFemResult(value)
}

function jsonValuesMatch(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true
  if (Array.isArray(first) || Array.isArray(second)) {
    return (
      Array.isArray(first) &&
      Array.isArray(second) &&
      first.length === second.length &&
      first.every((entry, index) => jsonValuesMatch(entry, second[index]))
    )
  }
  if (!isRecord(first) || !isRecord(second)) return false
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

export function pandaThermalFemRequestsMatch(
  first: PandaThermalFemRequest,
  second: PandaThermalFemRequest,
): boolean {
  return jsonValuesMatch(first, second)
}

export const PANDA_THERMAL_FEM_REFINEMENT_LEVELS: readonly {
  value: PandaThermalFemRefinementLevel
  label: string
}[] = [
  { value: 0, label: '0 Preview' },
  { value: 1, label: '1 Standard' },
  { value: 2, label: '2 Fine' },
]

export { isPandaMeshResult }
