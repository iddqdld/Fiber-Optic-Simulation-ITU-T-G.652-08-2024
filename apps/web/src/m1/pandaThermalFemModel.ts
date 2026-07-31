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
export type PandaThermalFemPhase =
  'idle' | 'loading' | 'ready' | 'validation' | 'error'

export type PandaThermalFemFieldName =
  | keyof PandaFieldFormValues
  | 'axialForceN'
  | 'prescribedStrainMicrostrain'
  | 'refinementLevel'

export type PandaThermalFemFieldErrors = Partial<
  Record<PandaThermalFemFieldName, string>
>

export type PandaThermalFemControls = {
  axialCondition: PandaThermalFemAxialCondition
  prescribedForceN: string
  prescribedStrainMicrostrain: string
  refinementLevel: PandaThermalFemRefinementLevel
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
  onCalculate: () => void
  onRetry: () => void
}

export const initialPandaThermalFemControls: PandaThermalFemControls = {
  axialCondition: 'free_resultant',
  prescribedForceN: '0',
  prescribedStrainMicrostrain: '0',
  refinementLevel: 1,
}

const femModelId = 'fem_generalized_plane_strain'
const femModelVersion = '1.0.0'
const femMethod = 'fem_generalized_plane_strain'
const femAxialConditions = new Set([
  'free_resultant',
  'prescribed_force',
  'prescribed_strain',
])
const femWarningCodes = new Set([
  'demonstration_data',
  'convergence_unavailable',
  'convergence_above_threshold',
])
const femStatuses = new Set(['unavailable', 'not_converged', 'converged'])
const celsiusToKelvin = 273.15
const microCteToCte = 1e-6
const microstrainToStrain = 1e-6

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }
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

function isStringArray(value: unknown, allowEmpty = false): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(isNonEmptyString)
  )
}

function isFiniteArray(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(isFiniteNumber)
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

  if (
    geometryResult.geometry === null ||
    cteValues.some((value) => value === null) ||
    temperature === null ||
    fictiveTemperature === null ||
    (axialValue === null && controls.axialCondition === 'prescribed_force') ||
    (strainValue === null && controls.axialCondition === 'prescribed_strain') ||
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
      refinement_level: controls.refinementLevel,
    },
    fieldErrors,
  }
}

function isMaterialSource(value: unknown): boolean {
  if (
    !hasExactKeys(value, ['citation', 'confidence', 'notes', 'source_date'])
  ) {
    return false
  }
  return (
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
      'core_center_y_m',
      'core_radius_m',
      'sap_1',
      'sap_2',
    ])
  ) {
    return false
  }
  const isSap = (sap: unknown): sap is GeometrySap => {
    if (!hasExactKeys(sap, ['center_x_m', 'center_y_m', 'radius_m'])) {
      return false
    }
    return (
      isPositiveNumber(sap.radius_m) &&
      isFiniteNumber(sap.center_x_m) &&
      isFiniteNumber(sap.center_y_m)
    )
  }
  const coreRadius = value.core_radius_m
  const claddingRadius = value.cladding_radius_m
  const coreCenterX = value.core_center_x_m
  const coreCenterY = value.core_center_y_m
  const sap1 = value.sap_1
  const sap2 = value.sap_2
  if (
    !isPositiveNumber(coreRadius) ||
    !isPositiveNumber(claddingRadius) ||
    !isFiniteNumber(coreCenterX) ||
    !isFiniteNumber(coreCenterY) ||
    !isSap(sap1) ||
    !isSap(sap2)
  ) {
    return false
  }
  if (coreRadius >= claddingRadius) {
    return false
  }
  const coreDistance = Math.hypot(coreCenterX, coreCenterY)
  if (coreDistance + coreRadius > claddingRadius) {
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

function isThermalRequest(value: unknown): value is PandaThermalFemRequest {
  return (
    hasExactKeys(value, [
      'axial_load',
      'geometry',
      'materials',
      'refinement_level',
      'thermal',
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
      'principal_axis_angle_rad',
      'principal_difference_pa',
      'principal_max_pa',
      'principal_min_pa',
    ])
  ) {
    return false
  }
  const angle = value.principal_axis_angle_rad
  return (
    hasExactKeys(value, [
      'area_m2',
      'average_stress_xx_pa',
      'average_stress_xy_pa',
      'average_stress_yy_pa',
      'average_stress_zz_pa',
      'principal_axis_angle_rad',
      'principal_difference_pa',
      'principal_max_pa',
      'principal_min_pa',
    ]) &&
    isPositiveNumber(value.area_m2) &&
    [
      value.average_stress_xx_pa,
      value.average_stress_xy_pa,
      value.average_stress_yy_pa,
      value.average_stress_zz_pa,
      value.principal_axis_angle_rad,
      value.principal_max_pa,
      value.principal_min_pa,
    ].every(isFiniteNumber) &&
    isNonNegativeNumber(value.principal_difference_pa) &&
    isFiniteNumber(angle) &&
    angle >= -Math.PI / 2 &&
    angle <= Math.PI / 2
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

function isConvergence(
  value: unknown,
  refinementLevel: number,
): value is PandaThermalFemResult['convergence'] {
  if (!Array.isArray(value) || value.length !== refinementLevel + 1) {
    return false
  }
  return value.every((entry, index) => {
    if (
      !hasExactKeys(entry, [
        'core_average_principal_difference_pa',
        'element_count',
        'node_count',
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
      !femStatuses.has(String(entry.status))
    ) {
      return false
    }
    return index === 0
      ? entry.relative_change === null && entry.status === 'unavailable'
      : isNonNegativeNumber(entry.relative_change) &&
          entry.status !== 'unavailable'
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
  return (
    hasExactKeys(value, [
      'assumptions',
      'axial_conditions',
      'axial_equation',
      'axial_strain_model',
      'birefringence_computed',
      'displacement_units',
      'element_family',
      'equation',
      'exterior_boundary',
      'limitations',
      'method',
      'model_id',
      'model_version',
      'quantity_type',
      'strain_units',
      'stress_measure',
      'stress_units',
      'thermal_strain_model',
    ]) &&
    value.model_id === femModelId &&
    value.model_version === femModelVersion &&
    value.method === femMethod &&
    value.stress_measure === 'cauchy_stress' &&
    value.quantity_type === 'quantitative_mechanical_output' &&
    value.stress_units === 'Pa' &&
    value.displacement_units === 'm' &&
    value.strain_units === '1' &&
    value.exterior_boundary === 'traction_free' &&
    value.element_family === 'first_order_triangles' &&
    value.axial_strain_model === 'uniform_epsilon_zz_0' &&
    value.equation === 'transverse_weak_equilibrium_plus_axial_resultant' &&
    value.axial_equation === 'integral_sigma_zz_d_a_equals_n_z' &&
    value.thermal_strain_model === 'full_per_region_alpha_delta_t' &&
    value.birefringence_computed === false &&
    Array.isArray(value.axial_conditions) &&
    value.axial_conditions.length === 3 &&
    value.axial_conditions[0] === 'free_resultant' &&
    value.axial_conditions[1] === 'prescribed_force' &&
    value.axial_conditions[2] === 'prescribed_strain' &&
    isStringArray(value.assumptions) &&
    isStringArray(value.limitations)
  )
}

function isThermalFemResult(value: unknown): value is PandaThermalFemResult {
  if (
    !hasExactKeys(value, [
      'anchor_reactions',
      'configuration',
      'convergence',
      'core_summary',
      'displacement_x_m',
      'displacement_y_m',
      'element_principal_axis_angle_rad',
      'element_principal_difference_pa',
      'element_principal_max_pa',
      'element_principal_min_pa',
      'element_strain_xx',
      'element_strain_xy',
      'element_strain_yy',
      'element_strain_zz',
      'element_stress_xx_pa',
      'element_stress_xy_pa',
      'element_stress_yy_pa',
      'element_stress_zz_pa',
      'epsilon_zz_0',
      'force_balance',
      'mesh',
      'model_manifest',
      'warnings',
    ]) ||
    !isThermalRequest(value.configuration) ||
    !isPandaMeshResult(value.mesh) ||
    !isCoreSummary(value.core_summary) ||
    !isAnchorReactions(value.anchor_reactions, value.mesh.node_count) ||
    !isForceBalance(
      value.force_balance,
      value.configuration.axial_load.condition,
    ) ||
    !isFiniteNumber(value.epsilon_zz_0) ||
    !isManifest(value.model_manifest) ||
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
    !isFiniteArray(value.element_principal_max_pa, value.mesh.element_count) ||
    !isFiniteArray(value.element_principal_min_pa, value.mesh.element_count) ||
    !isFiniteArray(
      value.element_principal_difference_pa,
      value.mesh.element_count,
    ) ||
    !isFiniteArray(
      value.element_principal_axis_angle_rad,
      value.mesh.element_count,
    ) ||
    !isConvergence(value.convergence, value.configuration.refinement_level)
  ) {
    return false
  }
  if (!value.element_principal_difference_pa.every(isNonNegativeNumber)) {
    return false
  }
  const selectedConvergence = value.convergence[value.convergence.length - 1]
  return (
    selectedConvergence.node_count === value.mesh.node_count &&
    selectedConvergence.element_count === value.mesh.element_count &&
    jsonValuesMatch(
      value.configuration.geometry,
      value.mesh.configuration.geometry,
    ) &&
    value.configuration.refinement_level ===
      value.mesh.configuration.refinement_level
  )
}

export function isPandaThermalFemResult(
  value: unknown,
): value is PandaThermalFemResult {
  return isThermalFemResult(value)
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
