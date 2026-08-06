import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import * as importExport from '../importExport'
import {
  initialPandaFieldValues,
  type PandaFieldController,
} from './pandaFieldModel'
import { PandaImportExportControls } from './PandaImportExportControls'
import {
  initialPandaThermalFemControls,
  type PandaThermalFemController,
} from './pandaThermalFemModel'
import { serializePandaConfiguration } from './pandaImportExport'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function fieldController(
  overrides: Partial<PandaFieldController> = {},
): PandaFieldController {
  return {
    values: initialPandaFieldValues,
    presentationMode: 'validity_aware',
    showReferenceSpokes: false,
    result: null,
    phase: 'idle',
    statusLabel: 'PANDA field not calculated',
    errorMessage: null,
    fieldErrors: {},
    onValueChange: vi.fn(),
    onPresentationModeChange: vi.fn(),
    onShowReferenceSpokesChange: vi.fn(),
    onImportConfiguration: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  }
}

function thermalController(
  overrides: Partial<PandaThermalFemController> = {},
): PandaThermalFemController {
  return {
    controls: initialPandaThermalFemControls,
    result: null,
    phase: 'idle',
    statusLabel: 'PANDA thermal FEM not calculated',
    errorMessage: null,
    fieldErrors: {},
    onAxialConditionChange: vi.fn(),
    onPrescribedForceChange: vi.fn(),
    onPrescribedStrainMicrostrainChange: vi.fn(),
    onRefinementLevelChange: vi.fn(),
    onLateralPressureMPaChange: vi.fn(),
    onWavelengthNmChange: vi.fn(),
    onGaussianModeFieldRadiusUmChange: vi.fn(),
    onTorsionCapabilityChange: vi.fn(),
    onTorsionInputModeChange: vi.fn(),
    onTwistRatePerMChange: vi.fn(),
    onAppliedTorqueNmChange: vi.fn(),
    onImportControls: vi.fn(),
    onCalculate: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  }
}

describe('PANDA import and export controls', () => {
  test('exports the complete PANDA configuration', () => {
    const download = vi
      .spyOn(importExport, 'downloadFile')
      .mockImplementation(() => {})

    render(
      <PandaImportExportControls
        workspace="fem-mesh"
        pandaField={fieldController()}
        thermalFem={thermalController()}
        onImport={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }))

    expect(download).toHaveBeenCalledWith(
      expect.stringMatching(/^panda_config_.*\.json$/),
      expect.stringContaining('panda-simulation-config'),
      'application/json',
    )
  })

  test('exports only the result from the active PANDA workspace', () => {
    const download = vi
      .spyOn(importExport, 'downloadFile')
      .mockImplementation(() => {})
    render(
      <PandaImportExportControls
        workspace="panda-field"
        pandaField={fieldController({ result: { field: true } as never })}
        thermalFem={thermalController({ result: { fem: true } as never })}
        onImport={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export Results' }))

    expect(download).toHaveBeenCalledWith(
      expect.stringMatching(/^panda_field_result_.*\.json$/),
      expect.stringContaining('panda-field-result'),
      'application/json',
    )
    expect(download).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('"fem": true'),
      expect.anything(),
    )
  })

  test('disables result export until the active result exists', () => {
    render(
      <PandaImportExportControls
        workspace="fem-mesh"
        pandaField={fieldController()}
        thermalFem={thermalController()}
        onImport={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Export Results' }),
    ).toBeDisabled()
  })

  test('imports a complete PANDA configuration', async () => {
    const onImport = vi.fn()
    const content = serializePandaConfiguration(
      'fem-mesh',
      initialPandaFieldValues,
      'reference_replica',
      true,
      initialPandaThermalFemControls,
    )
    render(
      <PandaImportExportControls
        workspace="panda-field"
        pandaField={fieldController()}
        thermalFem={thermalController()}
        onImport={onImport}
      />,
    )

    const file = new File([content], 'panda.json', {
      type: 'application/json',
    })
    fireEvent.change(
      screen.getByLabelText('Import PANDA configuration JSON file'),
      { target: { files: [file] } },
    )

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1))
    expect(onImport.mock.calls[0][0]).toMatchObject({
      workspace: 'fem-mesh',
      presentationMode: 'reference_replica',
      showReferenceSpokes: true,
    })
    expect(onImport.mock.calls[0][1]).toBe('panda.json')
    expect(screen.getByRole('status')).toHaveTextContent(
      'PANDA configuration imported.',
    )
  })
})
