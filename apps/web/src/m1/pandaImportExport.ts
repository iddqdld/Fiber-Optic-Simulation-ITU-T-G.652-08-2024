import {
  initialPandaFieldValues,
  parsePandaFieldValues,
  type PandaFieldFormValues,
  type PandaFieldPresentationMode,
  type PandaFieldResult,
} from './pandaFieldModel'
import {
  initialPandaThermalFemControls,
  parsePandaThermalFemValues,
  type PandaThermalFemControls,
  type PandaThermalFemResult,
} from './pandaThermalFemModel'
import type { M1WorkspaceId } from './M1WorkspaceCatalog'

export type PandaPortableConfiguration = {
  version: '1.0'
  type: 'panda-simulation-config'
  exportedAt: string
  workspace: M1WorkspaceId
  fieldValues: PandaFieldFormValues
  presentationMode: PandaFieldPresentationMode
  showReferenceSpokes: boolean
  thermalFemControls: PandaThermalFemControls
}

export type PandaConfigurationImportResult =
  | { success: true; configuration: PandaPortableConfiguration }
  | { success: false; error: string }

type PandaResult = PandaFieldResult | PandaThermalFemResult

const fieldNames = Object.keys(initialPandaFieldValues)
const controlNames = Object.keys(initialPandaThermalFemControls)
const stringControlNames = [
  'prescribedForceN',
  'prescribedStrainMicrostrain',
  'lateralPressureMPa',
  'wavelengthNm',
  'gaussianModeFieldRadiusUm',
  'twistRatePerM',
  'appliedTorqueNm',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

function isPandaWorkspace(value: unknown): value is M1WorkspaceId {
  return value === 'panda-field' || value === 'fem-mesh'
}

function isPresentationMode(
  value: unknown,
): value is PandaFieldPresentationMode {
  return value === 'validity_aware' || value === 'reference_replica'
}

function readFieldValues(value: unknown): PandaFieldFormValues | null {
  if (!isRecord(value) || !hasExactKeys(value, fieldNames)) return null
  if (!fieldNames.every((name) => typeof value[name] === 'string')) return null
  return value as PandaFieldFormValues
}

function readThermalControls(value: unknown): PandaThermalFemControls | null {
  if (!isRecord(value) || !hasExactKeys(value, controlNames)) return null
  if (!stringControlNames.every((name) => typeof value[name] === 'string')) {
    return null
  }
  if (
    value.refinementLevel !== 0 &&
    value.refinementLevel !== 1 &&
    value.refinementLevel !== 2
  ) {
    return null
  }
  if (
    value.axialCondition !== 'free_resultant' &&
    value.axialCondition !== 'prescribed_force' &&
    value.axialCondition !== 'prescribed_strain'
  ) {
    return null
  }
  if (
    value.torsionCapability !== 'none' &&
    value.torsionCapability !== 'saint_venant_homogeneous_circular_reference'
  ) {
    return null
  }
  if (
    value.torsionInputMode !== 'twist_rate' &&
    value.torsionInputMode !== 'applied_torque'
  ) {
    return null
  }
  return value as PandaThermalFemControls
}

export function serializePandaConfiguration(
  workspace: M1WorkspaceId,
  fieldValues: PandaFieldFormValues,
  presentationMode: PandaFieldPresentationMode,
  showReferenceSpokes: boolean,
  thermalFemControls: PandaThermalFemControls,
): string {
  const configuration: PandaPortableConfiguration = {
    version: '1.0',
    type: 'panda-simulation-config',
    exportedAt: new Date().toISOString(),
    workspace,
    fieldValues,
    presentationMode,
    showReferenceSpokes,
    thermalFemControls,
  }
  return JSON.stringify(configuration, null, 2)
}

export function parsePandaConfiguration(
  content: string,
): PandaConfigurationImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { success: false, error: 'The file does not contain valid JSON.' }
  }

  if (!isRecord(parsed)) {
    return {
      success: false,
      error: 'The configuration root must be an object.',
    }
  }
  const keys = [
    'version',
    'type',
    'exportedAt',
    'workspace',
    'fieldValues',
    'presentationMode',
    'showReferenceSpokes',
    'thermalFemControls',
  ]
  if (!hasExactKeys(parsed, keys)) {
    return {
      success: false,
      error: 'The PANDA configuration fields are invalid.',
    }
  }
  if (parsed.type !== 'panda-simulation-config') {
    return { success: false, error: 'The file is not a PANDA configuration.' }
  }
  if (parsed.version !== '1.0') {
    return {
      success: false,
      error: 'The PANDA configuration version is not supported.',
    }
  }
  if (
    typeof parsed.exportedAt !== 'string' ||
    !isPandaWorkspace(parsed.workspace) ||
    !isPresentationMode(parsed.presentationMode) ||
    typeof parsed.showReferenceSpokes !== 'boolean'
  ) {
    return {
      success: false,
      error: 'The PANDA configuration metadata is invalid.',
    }
  }

  const fieldValues = readFieldValues(parsed.fieldValues)
  const thermalFemControls = readThermalControls(parsed.thermalFemControls)
  if (fieldValues === null || thermalFemControls === null) {
    return { success: false, error: 'The PANDA input fields are invalid.' }
  }
  const activeInputsAreValid =
    parsed.workspace === 'panda-field'
      ? parsePandaFieldValues(fieldValues, parsed.presentationMode).request !==
        null
      : parsePandaThermalFemValues(fieldValues, thermalFemControls).request !==
        null
  if (!activeInputsAreValid) {
    return { success: false, error: 'The PANDA input values are invalid.' }
  }

  return {
    success: true,
    configuration: {
      version: '1.0',
      type: 'panda-simulation-config',
      exportedAt: parsed.exportedAt,
      workspace: parsed.workspace,
      fieldValues,
      presentationMode: parsed.presentationMode,
      showReferenceSpokes: parsed.showReferenceSpokes,
      thermalFemControls,
    },
  }
}

export function serializePandaResult(
  workspace: M1WorkspaceId,
  result: PandaResult,
): string {
  return JSON.stringify(
    {
      version: '1.0',
      type:
        workspace === 'panda-field'
          ? 'panda-field-result'
          : 'panda-thermal-fem-result',
      exportedAt: new Date().toISOString(),
      result,
    },
    null,
    2,
  )
}
