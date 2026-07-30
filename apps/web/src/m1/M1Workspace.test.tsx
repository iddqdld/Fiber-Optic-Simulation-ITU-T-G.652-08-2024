import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { M1Inspector } from './M1Inspector'
import { M1Results } from './M1Results'
import { M1Workspace } from './M1Workspace'
import { ISOLINE_THRESHOLDS } from './pandaFieldContours'
import {
  initialPandaFieldValues,
  type PandaFieldController,
  type PandaFieldResult,
} from './pandaFieldModel'

const canvasContext = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  stroke: vi.fn(),
  fillStyle: '',
  font: '',
  lineWidth: 1,
  strokeStyle: '',
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
    photoelastic_convention: 'p11_p12_strain',
    source: {
      citation: 'UI demonstration values',
      confidence: 'demonstration_only',
      source_date: null,
      notes: 'Not manufacturer data.',
    },
  }
}

function readyResult(): PandaFieldResult {
  const invalid = [null, null, null]
  return {
    configuration: {
      geometry: {
        core_radius_m: 4.1e-6,
        cladding_radius_m: 62.5e-6,
        core_center_x_m: 0,
        core_center_y_m: 0,
        sap_1: {
          radius_m: 15e-6,
          center_x_m: -30e-6,
          center_y_m: 0,
        },
        sap_2: {
          radius_m: 15e-6,
          center_x_m: 30e-6,
          center_y_m: 0,
        },
      },
      materials: {
        core: demonstrationMaterial('Core', 0.55e-6),
        cladding: demonstrationMaterial('Cladding', 0.55e-6),
        sap_1: demonstrationMaterial('SAP 1', 1.2e-6),
        sap_2: demonstrationMaterial('SAP 2', 1.2e-6),
      },
      thermal: {
        temperature_k: 293.15,
        effective_fictive_temperature_k: 1473.15,
      },
      wavelength_m: 1.55e-6,
      sampling: {
        grid_half_width_m: 62.5e-6,
        grid_points: 3,
        interface_buffer_m: 2e-6,
      },
    },
    x_coordinates_m: [-62.5e-6, 0, 62.5e-6],
    y_coordinates_m: [-62.5e-6, 0, 62.5e-6],
    validity_mask: [
      [false, false, false],
      [false, true, false],
      [false, false, false],
    ],
    normalized_deviatoric_difference_kernel: [
      invalid,
      [null, -0.75, null],
      invalid,
    ],
    normalized_shear_kernel: [invalid, [null, 0.25, null], invalid],
    normalized_principal_difference_kernel: [
      invalid,
      [null, 0.8, null],
      invalid,
    ],
    principal_axis_angle_rad: [invalid, [null, Math.PI / 6, null], invalid],
    sap_thermal_mismatch_strains: [0.000767, 0.000767],
    kernel_scale: 0.001,
    warnings: [
      {
        code: 'qualitative_uncalibrated',
        message: 'K_i is undefined; this is a normalized qualitative kernel.',
        output_field: 'normalized_deviatoric_difference_kernel',
      },
      {
        code: 'finite_cladding_approximation',
        message: 'The finite cladding boundary is not solved.',
        output_field: 'normalized_deviatoric_difference_kernel',
      },
    ],
    model_manifest: {
      model_id: 'panda_qualitative_far_field_kernel',
      model_version: '1.1.0',
      method: 'qualitative_far_field_kernel',
      quantity_type: 'normalized_dimensionless_kernel',
      normalization: 'max_valid_absolute_deviatoric_difference',
      auxiliary_normalization:
        'max_valid_absolute_shear_and_max_valid_principal_difference',
      quantitative: false,
      units: '1',
      equation_references: [
        'M1-3.3',
        'M1-5.3',
        'M1-5.4',
        'M1-5.5',
        'M1-5.6',
        'M1-5.7',
      ],
      assumptions: [
        'constant thermal expansion coefficients over the temperature interval',
        'linear superposition of two far-field inclusion kernels',
      ],
      limitations: [
        'outputs are normalized qualitative kernels without calibrated stress values',
        'the finite cladding boundary is not solved',
      ],
      validity: {
        outside_cladding_masked: true,
        sap_interiors_masked: true,
        interface_buffer_m: 2e-6,
        valid_point_count: 1,
      },
    },
  } as PandaFieldResult
}

function controller(
  overrides: Partial<PandaFieldController> = {},
): PandaFieldController {
  return {
    values: { ...initialPandaFieldValues },
    presentationMode: 'validity_aware',
    showReferenceSpokes: false,
    result: null,
    phase: 'idle',
    statusLabel: 'Waiting for PANDA field map…',
    errorMessage: null,
    fieldErrors: {},
    onValueChange: vi.fn(),
    onPresentationModeChange: vi.fn(),
    onShowReferenceSpokesChange: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    canvasContext as unknown as CanvasRenderingContext2D,
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('M1 PANDA field workspace', () => {
  test('groups every input, explains boundaries, and calls controller callbacks', () => {
    const onValueChange = vi.fn()
    const onPresentationModeChange = vi.fn()
    const fieldController = controller({
      phase: 'validation',
      statusLabel: 'Check the highlighted values.',
      fieldErrors: { coreRadiusUm: 'Core radius must be smaller.' },
      onValueChange,
      onPresentationModeChange,
    })
    const { container } = render(
      <M1Inspector workspace="panda-field" pandaField={fieldController} />,
    )

    expect(screen.getByText('Geometry')).toBeVisible()
    expect(screen.getByText('Thermal mismatch')).toBeInTheDocument()
    expect(screen.getByText('Sampling and presentation')).toBeInTheDocument()
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(17)
    expect(
      screen.getByText(/Material values are demonstration-only/),
    ).toBeVisible()
    expect(screen.getByText(/Only the SAP–cladding CTE mismatch/)).toBeVisible()

    const coreRadius = screen.getByLabelText('Core radius (µm)')
    expect(coreRadius).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Core radius must be smaller.')).toBeVisible()
    expect(
      screen.getByText(/Greater than 0 and smaller than the cladding radius/),
    ).toBeVisible()
    fireEvent.change(coreRadius, { target: { value: '4.3' } })
    expect(onValueChange).toHaveBeenCalledWith('coreRadiusUm', '4.3')

    fireEvent.click(
      screen.getByRole('radio', {
        name: /Reference replica \(comparison-only\)/,
      }),
    )
    expect(onPresentationModeChange).toHaveBeenCalledWith('reference_replica')
    expect(
      screen.getByText(/Odd integer from 401 to 601 inclusive/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Displayed field')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Retry/ }),
    ).not.toBeInTheDocument()
  })

  test('shows retry only for an error phase', () => {
    const onRetry = vi.fn()
    render(
      <M1Inspector
        workspace="panda-field"
        pandaField={controller({
          phase: 'error',
          statusLabel: 'Field map unavailable.',
          errorMessage: 'Unable to reach the PANDA field service.',
          onRetry,
        })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to reach the PANDA field service.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry field map' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  test('shows and toggles radial spokes only for reference replica mode', () => {
    const onShowReferenceSpokesChange = vi.fn()
    const { rerender } = render(
      <M1Inspector
        workspace="panda-field"
        pandaField={controller({ onShowReferenceSpokesChange })}
      />,
    )

    expect(
      screen.queryByRole('checkbox', { name: /Show radial spokes/ }),
    ).not.toBeInTheDocument()

    rerender(
      <M1Inspector
        workspace="panda-field"
        pandaField={controller({
          presentationMode: 'reference_replica',
          onShowReferenceSpokesChange,
        })}
      />,
    )
    const spokes = screen.getByRole('checkbox', { name: /Show radial spokes/ })
    fireEvent.click(spokes)
    expect(onShowReferenceSpokesChange).toHaveBeenCalledWith(true)
  })

  test.each([
    ['idle', 'Configure the PANDA field inputs'],
    ['loading', 'Calculating the normalized qualitative PANDA field map'],
    ['validation', 'highlighted inputs are valid'],
    ['error', 'Calculation service unavailable'],
  ] as const)('does not show a stale canvas in %s state', (phase, message) => {
    render(
      <M1Workspace
        workspace="panda-field"
        pandaField={controller({
          phase,
          result: readyResult(),
          errorMessage:
            phase === 'error' ? 'Calculation service unavailable' : null,
        })}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(message)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/No stale field map/)).toBeVisible()
  })

  test('draws the ready backend grid, masks, geometry, axes, and core axis', () => {
    render(
      <M1Workspace
        workspace="panda-field"
        pandaField={controller({
          phase: 'ready',
          statusLabel: 'PANDA field ready',
          result: readyResult(),
        })}
      />,
    )

    const canvas = screen.getByRole('img', {
      name: 'Signed normalized deviatoric difference qualitative PANDA field map',
    })
    expect(canvas).toHaveAttribute('width', '720')
    expect(canvas).toHaveAttribute('height', '720')
    expect(screen.getByText('Qualitative')).toBeVisible()
    expect(screen.getByText('dimensionless')).toBeVisible()
    expect(screen.getByText('−1')).toBeVisible()
    expect(screen.getByText('0')).toBeVisible()
    expect(screen.getByText('+1')).toBeVisible()
    expect(screen.getByText(/does not report stress in pascals/)).toBeVisible()
    expect(screen.getByText(/semi-transparent hatched overlay/)).toBeVisible()
    expect(screen.getByText(/30\.00° from the positive x-axis/)).toBeVisible()
    expect(canvasContext.fillRect).toHaveBeenCalledTimes(1)
    expect(canvasContext.fill).toHaveBeenCalledWith('evenodd')
    expect(ISOLINE_THRESHOLDS).toContain(0)
    expect(canvasContext.arc).toHaveBeenCalledTimes(4)
    expect(canvasContext.moveTo).toHaveBeenCalled()
    expect(canvasContext.lineTo).toHaveBeenCalled()
    expect(canvasContext.fillText).toHaveBeenCalledWith(
      'x (µm)',
      expect.any(Number),
      expect.any(Number),
    )
    expect(canvasContext.fillText).toHaveBeenCalledWith(
      'y (µm)',
      expect.any(Number),
      expect.any(Number),
    )
  })

  test('reports when the core-center principal axis is undefined', () => {
    const result = readyResult()
    const fieldController = controller({
      phase: 'ready',
      result: {
        ...result,
        principal_axis_angle_rad: [
          ...result.principal_axis_angle_rad.slice(0, 1),
          [null, null, null],
          ...result.principal_axis_angle_rad.slice(2),
        ],
      },
    })

    render(<M1Workspace workspace="panda-field" pandaField={fieldController} />)

    expect(
      screen.getByText(/Core-centre principal axis is undefined/),
    ).toBeVisible()
  })

  test('always uses the signed deviatoric field without changing the fixed scale', () => {
    const fieldController = controller({
      phase: 'ready',
      result: readyResult(),
    })
    render(<M1Workspace workspace="panda-field" pandaField={fieldController} />)

    expect(
      screen.getByRole('heading', {
        name: 'Signed normalized deviatoric difference',
        level: 3,
      }),
    ).toBeVisible()
    expect(
      screen.getByLabelText('Fixed colour scale from -1 to +1'),
    ).toBeVisible()

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(
      screen.getByText(/only the signed normalized deviatoric/),
    ).toBeVisible()
  })

  test('reports qualitative metadata, warnings, validity, and core-axis result', () => {
    render(
      <M1Results
        workspace="panda-field"
        pandaField={controller({ phase: 'ready', result: readyResult() })}
      />,
    )

    expect(screen.getByText('Qualitative far-field kernel')).toBeVisible()
    expect(screen.getByText('Normalized dimensionless kernel')).toBeVisible()
    expect(screen.getByText('1 — dimensionless')).toBeVisible()
    expect(
      screen.getByText('Maximum valid absolute deviatoric difference'),
    ).toBeVisible()
    expect(screen.getByText('1.000000e-3')).toBeVisible()
    expect(screen.getByText('3 × 3')).toBeVisible()
    expect(screen.getByText(/2\.000 µm applied/)).toBeVisible()
    expect(screen.getByText('30.000° from +x')).toBeVisible()
    expect(screen.getByText('Qualitative only')).toBeVisible()
    expect(screen.getByText(/K_i is undefined/)).toBeVisible()
    expect(
      screen.getByText(/constant thermal expansion coefficients/),
    ).toBeVisible()
    expect(
      screen.getAllByText(/finite cladding boundary/).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(/does not report stress in pascals/)).toBeVisible()
  })

  test('keeps FEM unconnected and free of PANDA controls and canvas', () => {
    const fieldController = controller({
      phase: 'ready',
      result: readyResult(),
    })
    const { container } = render(
      <>
        <M1Inspector workspace="fem-mesh" pandaField={fieldController} />
        <M1Workspace workspace="fem-mesh" pandaField={fieldController} />
        <M1Results workspace="fem-mesh" pandaField={fieldController} />
      </>,
    )

    expect(screen.getByRole('heading', { name: 'FEM mesh' })).toBeVisible()
    expect(screen.getByText(/Figure 9\.1/)).toBeVisible()
    expect(screen.getByText(/No mesh or validation values/)).toBeVisible()
    expect(container.querySelector('canvas')).not.toBeInTheDocument()
    expect(container.querySelector('input')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Displayed field')).not.toBeInTheDocument()
  })
})
