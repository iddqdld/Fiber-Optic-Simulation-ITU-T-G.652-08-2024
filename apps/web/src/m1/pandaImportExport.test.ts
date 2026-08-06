import { describe, expect, test } from 'vitest'

import {
  initialPandaFieldValues,
  type PandaFieldResult,
} from './pandaFieldModel'
import {
  initialPandaThermalFemControls,
  type PandaThermalFemResult,
} from './pandaThermalFemModel'
import {
  parsePandaConfiguration,
  serializePandaConfiguration,
  serializePandaResult,
} from './pandaImportExport'

function serializedConfiguration() {
  return serializePandaConfiguration(
    'fem-mesh',
    initialPandaFieldValues,
    'validity_aware',
    false,
    initialPandaThermalFemControls,
  )
}

describe('PANDA import and export', () => {
  test('round-trips all shared field and FEM controls', () => {
    const result = parsePandaConfiguration(serializedConfiguration())

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.configuration.workspace).toBe('fem-mesh')
    expect(result.configuration.fieldValues).toEqual(initialPandaFieldValues)
    expect(result.configuration.presentationMode).toBe('validity_aware')
    expect(result.configuration.showReferenceSpokes).toBe(false)
    expect(result.configuration.thermalFemControls).toEqual(
      initialPandaThermalFemControls,
    )
  })

  test('rejects invalid JSON and an unsupported file type or version', () => {
    expect(parsePandaConfiguration('{bad json')).toEqual({
      success: false,
      error: 'The file does not contain valid JSON.',
    })

    const wrongType = JSON.parse(serializedConfiguration()) as Record<
      string,
      unknown
    >
    wrongType.type = 'g652-simulation-config'
    expect(parsePandaConfiguration(JSON.stringify(wrongType))).toEqual({
      success: false,
      error: 'The file is not a PANDA configuration.',
    })

    const wrongVersion = JSON.parse(serializedConfiguration()) as Record<
      string,
      unknown
    >
    wrongVersion.version = '2.0'
    expect(parsePandaConfiguration(JSON.stringify(wrongVersion))).toEqual({
      success: false,
      error: 'The PANDA configuration version is not supported.',
    })
  })

  test('rejects extra fields and invalid physical values', () => {
    const extraField = JSON.parse(serializedConfiguration()) as Record<
      string,
      unknown
    >
    extraField.unknown = true
    expect(parsePandaConfiguration(JSON.stringify(extraField))).toEqual({
      success: false,
      error: 'The PANDA configuration fields are invalid.',
    })

    const invalidGeometry = JSON.parse(serializedConfiguration()) as {
      fieldValues: Record<string, unknown>
    }
    invalidGeometry.fieldValues.coreRadiusUm = '-1'
    expect(parsePandaConfiguration(JSON.stringify(invalidGeometry))).toEqual({
      success: false,
      error: 'The PANDA input values are invalid.',
    })
  })

  test('rejects incomplete FEM controls', () => {
    const incomplete = JSON.parse(serializedConfiguration()) as {
      thermalFemControls: Record<string, unknown>
    }
    delete incomplete.thermalFemControls.wavelengthNm

    expect(parsePandaConfiguration(JSON.stringify(incomplete))).toEqual({
      success: false,
      error: 'The PANDA input fields are invalid.',
    })
  })

  test('accepts a valid FEM state that has no qualitative field scale', () => {
    const equalCte = JSON.parse(serializedConfiguration()) as {
      fieldValues: Record<string, unknown>
    }
    equalCte.fieldValues.sap1CteMicroPerK = '0.55'
    equalCte.fieldValues.sap2CteMicroPerK = '0.55'

    const result = parsePandaConfiguration(JSON.stringify(equalCte))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.configuration.workspace).toBe('fem-mesh')
    expect(result.configuration.fieldValues.sap1CteMicroPerK).toBe('0.55')
  })

  test('labels each exported result type', () => {
    const field = JSON.parse(
      serializePandaResult('panda-field', { model: 'field' } as never),
    ) as { type: string; result: PandaFieldResult }
    const fem = JSON.parse(
      serializePandaResult('fem-mesh', { model: 'fem' } as never),
    ) as { type: string; result: PandaThermalFemResult }

    expect(field.type).toBe('panda-field-result')
    expect(field.result).toEqual({ model: 'field' })
    expect(fem.type).toBe('panda-thermal-fem-result')
    expect(fem.result).toEqual({ model: 'fem' })
  })
})
