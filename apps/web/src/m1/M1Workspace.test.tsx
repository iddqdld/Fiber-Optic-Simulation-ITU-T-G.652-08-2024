import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { M1Inspector } from './M1Inspector'
import { M1Results } from './M1Results'
import { M1Workspace } from './M1Workspace'
import * as pandaFieldContours from './pandaFieldContours'
import { ISOLINE_THRESHOLDS } from './pandaFieldContours'
import * as pandaThermalFemDrawing from './pandaThermalFemDrawing'
import { buildPandaThermalFemDrawingGeometry } from './pandaThermalFemDrawing'
import {
  initialPandaFieldValues,
  type PandaFieldController,
  type PandaFieldResult,
} from './pandaFieldModel'
import type {
  PandaThermalFemController,
  PandaThermalFemResult,
} from './pandaThermalFemModel'

const canvasContext = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  clip: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
  fillStyle: '',
  font: '',
  lineWidth: 1,
  strokeStyle: '',
  setTransform: vi.fn(),
}

class MockPath2D {
  moveTo = vi.fn()
  lineTo = vi.fn()
  closePath = vi.fn()
  arc = vi.fn()
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
    core_principal_axis_angle_rad: Math.PI / 6,
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
      model_version: '1.2.0',
      method: 'qualitative_far_field_kernel',
      quantity_type: 'normalized_dimensionless_kernel',
      normalization: 'max_valid_absolute_deviatoric_difference',
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

function thermalFemResult(): PandaThermalFemResult {
  return {
    configuration: {
      geometry: {
        cladding_radius_m: 62.5e-6,
        core_radius_m: 4.1e-6,
        core_center_x_m: 0,
        core_center_y_m: 0,
        sap_1: { radius_m: 15e-6, center_x_m: -30e-6, center_y_m: 0 },
        sap_2: { radius_m: 15e-6, center_x_m: 30e-6, center_y_m: 0 },
      },
      materials: {} as PandaThermalFemResult['configuration']['materials'],
      thermal: {} as PandaThermalFemResult['configuration']['thermal'],
      axial_load: {
        condition: 'free_resultant',
        prescribed_force_n: null,
        prescribed_strain: null,
      },
      refinement_level: 1,
    },
    mesh: {
      configuration: {
        geometry: {
          cladding_radius_m: 62.5e-6,
          core_radius_m: 4.1e-6,
          core_center_x_m: 0,
          core_center_y_m: 0,
          sap_1: { radius_m: 15e-6, center_x_m: -30e-6, center_y_m: 0 },
          sap_2: { radius_m: 15e-6, center_x_m: 30e-6, center_y_m: 0 },
        },
        refinement_level: 1,
      },
      nodes_m: [
        [-62.5e-6, -62.5e-6],
        [62.5e-6, -62.5e-6],
        [62.5e-6, 62.5e-6],
        [-62.5e-6, 62.5e-6],
        [0, 0],
      ],
      elements: [
        [0, 1, 4],
        [1, 2, 4],
        [2, 3, 4],
        [3, 0, 4],
      ],
      region_tags: ['cladding', 'core', 'sap_1', 'sap_2'],
      node_count: 5,
      element_count: 4,
      region_summaries: [],
      quality: {
        minimum_angle_deg: 30,
        minimum_normalized_quality: 0.5,
        mean_normalized_quality: 0.8,
      },
      warnings: [],
      model_manifest: {
        model_id: 'panda_constrained_delaunay_mesh',
        model_version: '1.0.0',
        geometry_model: 'PandaGeometry',
        interface_model: 'piecewise_linear_circular_interfaces',
        method: 'constrained_delaunay',
        element_family: 'first_order_triangles',
        generator_version: 'triangle 20250106',
        fem_compatibility_version: 'scikit-fem 12.0.2',
        quality_target_minimum_angle_deg: 20,
        mesh_only: true,
        solved_fem_fields: false,
        coordinate_units: 'm',
        assumptions: [],
        limitations: [],
      } as PandaThermalFemResult['mesh']['model_manifest'],
    },
    displacement_x_m: [-2e-6, -1e-6, 1e-6, 2e-6, 0],
    displacement_y_m: [1e-6, 2e-6, -2e-6, -1e-6, 0],
    element_strain_xx: [-1e-4, -5e-5, 5e-5, 1e-4],
    element_strain_yy: [-2e-4, -1e-4, 1e-4, 2e-4],
    element_strain_zz: [-3e-4, -1.5e-4, 1.5e-4, 3e-4],
    element_strain_xy: [-4e-4, -2e-4, 2e-4, 4e-4],
    element_stress_xx_pa: [-2e6, -1e6, 1e6, 2e6],
    element_stress_yy_pa: [-4e6, -2e6, 2e6, 4e6],
    element_stress_zz_pa: [-6e6, -3e6, 3e6, 6e6],
    element_stress_xy_pa: [-8e6, -4e6, 4e6, 8e6],
    element_principal_max_pa: [-10e6, -5e6, 5e6, 10e6],
    element_principal_min_pa: [-12e6, -6e6, 6e6, 12e6],
    element_principal_difference_pa: [1e6, 2e6, 3e6, 4e6],
    element_principal_axis_angle_rad: [0, 0, 0, 0],
    element_stress_optic_coefficient_per_pa: [1e-12, 1e-12, 2e-12, 2e-12],
    element_signed_local_material_birefringence: [-2e-6, -1e-6, 1e-6, 2e-6],
    element_local_material_birefringence: [2e-6, 1e-6, 1e-6, 2e-6],
    element_local_material_slow_axis_angle_rad: [null, 0, Math.PI / 4, null],
    epsilon_zz_0: 1.25e-4,
    core_summary: {
      area_m2: 5e-11,
      average_stress_xx_pa: 1.2e6,
      average_stress_yy_pa: -0.8e6,
      average_stress_zz_pa: 0.4e6,
      average_stress_xy_pa: 0.2e6,
      principal_max_pa: 1.3e6,
      principal_min_pa: -0.9e6,
      principal_difference_pa: 2.2e6,
      principal_axis_angle_rad: Math.PI / 6,
      stress_optic_coefficient_per_pa: 1e-12,
      signed_local_material_birefringence: 2.2e-6,
      local_material_birefringence: 2.2e-6,
      local_material_slow_axis_angle_rad: Math.PI / 6,
    },
    anchor_reactions: {
      primary_node_index: 0,
      secondary_node_index: 1,
      primary_reaction_x_n_per_m: 0,
      primary_reaction_y_n_per_m: 0,
      secondary_reaction_x_n_per_m: 0,
      secondary_reaction_y_n_per_m: 0,
    },
    force_balance: {
      transverse_free_residual_l2_n_per_m: 1e-9,
      transverse_resultant_x_n_per_m: 0,
      transverse_resultant_y_n_per_m: 0,
      axial_resultant_n: 0,
      axial_target_n: 0,
      axial_residual_n: 0,
    },
    convergence: [
      {
        refinement_level: 0,
        node_count: 5,
        element_count: 4,
        core_average_principal_difference_pa: 2e6,
        core_average_local_material_birefringence: 2e-6,
        local_material_birefringence_relative_change: null,
        local_material_birefringence_status: 'unavailable',
        relative_change: null,
        status: 'unavailable',
      },
      {
        refinement_level: 1,
        node_count: 5,
        element_count: 4,
        core_average_principal_difference_pa: 2.2e6,
        core_average_local_material_birefringence: 2.2e-6,
        local_material_birefringence_relative_change: 0.09,
        local_material_birefringence_status: 'not_converged',
        relative_change: 0.09,
        status: 'not_converged',
      },
    ],
    warnings: [
      {
        code: 'demonstration_data',
        message: 'At least one material uses demonstration-only data.',
        refinement_level: null,
      },
    ],
    model_manifest: {
      model_id: 'fem_generalized_plane_strain',
      model_version: '1.1.0',
      method: 'fem_generalized_plane_strain',
      stress_measure: 'cauchy_stress',
      quantity_type: 'quantitative_mechanical_output',
      stress_units: 'Pa',
      displacement_units: 'm',
      strain_units: '1',
      exterior_boundary: 'traction_free',
      element_family: 'first_order_triangles',
      axial_strain_model: 'uniform_epsilon_zz_0',
      equation: 'transverse_weak_equilibrium_plus_axial_resultant',
      axial_equation: 'integral_sigma_zz_d_a_equals_n_z',
      axial_conditions: [
        'free_resultant',
        'prescribed_force',
        'prescribed_strain',
      ],
      thermal_strain_model: 'full_per_region_alpha_delta_t',
      birefringence_computed: true,
      assumptions: ['small strain isotropic thermoelasticity'],
      limitations: [
        'local material stress-optic birefringence is computed without modal propagation',
        'modal phase and group birefringence and beat length are not computed',
      ],
      equation_references: ['M1-6.9', 'M1-6.10', 'M1-6.11', 'M1-6.12'],
      birefringence_scope: 'local_material_only',
      birefringence_quantity: 'signed_local_material_index_difference',
      birefringence_units: '1',
      stress_optic_coefficient_units: 'Pa^-1',
      local_not_modal: true,
    },
    qualitative_kernel_fem_shape_comparison: {
      model_id: 'qualitative_kernel_fem_shape_comparison',
      quantitative: false,
      units: '1',
      domain: 'core_elements',
      sample_count: 1,
      available: false,
      kernel_scale: 0,
      fem_signed_deviatoric_stress_scale_pa: 0,
      best_polarity: null,
      rmse: null,
      correlation: null,
      sign_agreement: null,
      unavailable_reason: 'insufficient_core_elements',
      limitations: [
        'the qualitative kernel has undefined sign and scale, so the best polarity is fitted',
        'this is a normalized shape comparison and not a stress error',
        'quantitative Eshelby error and birefringence error are unavailable',
      ],
    },
  } as PandaThermalFemResult
}

function thermalFemController(
  overrides: Partial<PandaThermalFemController> = {},
): PandaThermalFemController {
  return {
    controls: {
      axialCondition: 'free_resultant',
      prescribedForceN: '0',
      prescribedStrainMicrostrain: '0',
      refinementLevel: 1,
    },
    result: null,
    phase: 'idle',
    statusLabel: 'PANDA thermal FEM not calculated',
    errorMessage: null,
    fieldErrors: {},
    onAxialConditionChange: vi.fn(),
    onPrescribedForceChange: vi.fn(),
    onPrescribedStrainMicrostrainChange: vi.fn(),
    onRefinementLevelChange: vi.fn(),
    onCalculate: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal('Path2D', MockPath2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    canvasContext as unknown as CanvasRenderingContext2D,
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
    expect(canvasContext.arc).toHaveBeenCalledTimes(10)
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
        core_principal_axis_angle_rad: null,
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

  test('memoizes contours when reference spokes are toggled', () => {
    const buildContours = vi.spyOn(
      pandaFieldContours,
      'buildPandaFieldContourGeometries',
    )
    const result = readyResult()
    const { rerender } = render(
      <M1Workspace
        workspace="panda-field"
        pandaField={controller({
          phase: 'ready',
          result,
          presentationMode: 'reference_replica',
        })}
      />,
    )

    expect(buildContours).toHaveBeenCalledOnce()
    rerender(
      <M1Workspace
        workspace="panda-field"
        pandaField={controller({
          phase: 'ready',
          result,
          presentationMode: 'reference_replica',
          showReferenceSpokes: true,
        })}
      />,
    )
    expect(buildContours).toHaveBeenCalledOnce()
  })

  test('draws fixed vector mask paths independent of invalid cell count', () => {
    const result = readyResult()
    const denseResult = {
      ...result,
      validity_mask: result.validity_mask.map((row) => row.map(() => false)),
    }
    const toCoordinate = (value: number) => value

    pandaFieldContours.drawInvalidMaskOverlay(
      canvasContext as unknown as CanvasRenderingContext2D,
      result,
      toCoordinate,
      toCoordinate,
      'validity_aware',
    )
    const sparseArcCalls = canvasContext.arc.mock.calls.length
    canvasContext.arc.mockClear()
    pandaFieldContours.drawInvalidMaskOverlay(
      canvasContext as unknown as CanvasRenderingContext2D,
      denseResult,
      toCoordinate,
      toCoordinate,
      'validity_aware',
    )

    expect(canvasContext.arc).toHaveBeenCalledTimes(sparseArcCalls)
    expect(canvasContext.arc).toHaveBeenCalledTimes(6)
    expect(canvasContext.fillRect).not.toHaveBeenCalled()
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
    expect(screen.getAllByText('30.000° from +x')).not.toHaveLength(0)
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

  test('reports quantitative FEM metadata, local optics, balance, convergence, and limits', () => {
    const result = thermalFemResult()
    const prescribedStrainResult = {
      ...result,
      configuration: {
        ...result.configuration,
        axial_load: {
          condition: 'prescribed_strain' as const,
          prescribed_force_n: null,
          prescribed_strain: 1.25e-4,
        },
      },
      force_balance: {
        ...result.force_balance,
        axial_target_n: null,
        axial_residual_n: null,
      },
    }

    render(
      <M1Results
        workspace="fem-mesh"
        thermalFem={thermalFemController({
          phase: 'ready',
          result: prescribedStrainResult,
        })}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Thermoelastic FEM results' }),
    ).toBeVisible()
    expect(screen.getByText(/Quantitative mechanical FEM result/)).toBeVisible()
    expect(screen.getByText('Prescribed axial strain')).toBeVisible()
    expect(screen.getByText(/1.250000e-4/)).toBeVisible()
    expect(screen.getByText('1.200000 MPa / -0.800000 MPa')).toBeVisible()
    expect(screen.getByText('2.200000 MPa')).toBeVisible()
    expect(screen.getByText('1.000000e-12 Pa⁻¹')).toBeVisible()
    expect(screen.getAllByText('2.200000e-6 Δn')).toHaveLength(2)
    expect(screen.getAllByText('30.000° from +x')).not.toHaveLength(0)
    expect(
      screen.getAllByText(/Not imposed for prescribed strain/),
    ).toHaveLength(2)
    expect(
      screen.getByText(/Level 1: 5 nodes · 4 elements · change 9.00%/),
    ).toBeVisible()
    expect(screen.getByText(/Minimum angle: 30.000°/)).toBeVisible()
    expect(screen.getByText(/MPa = Pa × 1e−6/)).toBeVisible()
    expect(screen.getByText('Demonstration data')).toBeVisible()
    expect(
      screen.getByText(/small strain isotropic thermoelasticity/),
    ).toBeVisible()
    expect(screen.getAllByText(/not modal Bp/)).not.toHaveLength(0)
    expect(screen.getByText(/Figure 5.1 shape comparison/)).toBeVisible()
    expect(
      screen.getByText(/fewer than two core-element samples/i),
    ).toBeVisible()
  })

  test('shows available qualitative comparison metrics and local convergence', () => {
    const result = thermalFemResult()
    const availableResult = {
      ...result,
      qualitative_kernel_fem_shape_comparison: {
        ...result.qualitative_kernel_fem_shape_comparison,
        sample_count: 24,
        available: true,
        kernel_scale: 0.5,
        fem_signed_deviatoric_stress_scale_pa: 2e6,
        best_polarity: -1 as const,
        rmse: 0.125,
        correlation: 0.82,
        sign_agreement: 0.875,
        unavailable_reason: null,
      },
    }

    render(
      <M1Results
        workspace="fem-mesh"
        thermalFem={thermalFemController({
          phase: 'ready',
          result: availableResult,
        })}
      />,
    )

    expect(screen.getByText('Available')).toBeVisible()
    expect(screen.getByText('24 core elements')).toBeVisible()
    expect(screen.getByText('0.125000')).toBeVisible()
    expect(screen.getByText('0.820000')).toBeVisible()
    expect(screen.getByText('87.50%')).toBeVisible()
    expect(screen.getByText('−1')).toBeVisible()
    expect(screen.getAllByText(/local Δn/)).not.toHaveLength(0)
  })

  test.each([
    ['idle', 'Calculate the PANDA thermoelastic FEM result'],
    [
      'loading',
      'Calculating the generalized-plane-strain thermoelastic FEM result',
    ],
    ['validation', 'highlighted inputs are valid'],
    ['error', 'Thermal FEM service unavailable'],
  ] as const)(
    'does not show a stale FEM field in %s state',
    (phase, message) => {
      render(
        <M1Workspace
          workspace="fem-mesh"
          thermalFem={thermalFemController({
            phase,
            result: thermalFemResult(),
            errorMessage:
              phase === 'error' ? 'Thermal FEM service unavailable' : null,
          })}
        />,
      )

      expect(
        screen.getByRole(phase === 'error' ? 'alert' : 'status'),
      ).toHaveTextContent(message)
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(screen.getByText(/No stale quantitative FEM field/)).toBeVisible()
    },
  )

  test('renders ready quantitative FEM output with local-material optics text', () => {
    const result = thermalFemResult()
    const geometry = buildPandaThermalFemDrawingGeometry(result)
    expect(geometry.nodeCount).toBe(result.mesh.node_count)
    expect(geometry.elementCount).toBe(result.mesh.element_count)
    expect(geometry.bins).toHaveLength(21)
    expect(geometry.interfaceEdgeCount).toBeGreaterThan(0)
    expect(geometry.outerEdgeCount).toBeGreaterThan(0)

    render(
      <M1Workspace
        workspace="fem-mesh"
        thermalFem={thermalFemController({ phase: 'ready', result })}
      />,
    )

    expect(
      screen.getByRole('img', {
        name: /Principal stress difference.*Step 2.7 FEM field/,
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', {
        name: 'Generalized-plane-strain thermoelastic FEM',
      }),
    ).toBeVisible()
    expect(screen.getByText('Quantitative FEM')).toBeVisible()
    expect(screen.getAllByText(/not modal Bp/)).not.toHaveLength(0)
    expect(screen.getByText(/MPa from Pa × 1e−6/)).toBeVisible()
    expect(canvasContext.fill).toHaveBeenCalled()
    expect(canvasContext.stroke).toHaveBeenCalled()
  })

  test('keeps FEM field view controls local, bounded, and accessible', () => {
    render(
      <M1Workspace
        workspace="fem-mesh"
        thermalFem={thermalFemController({
          phase: 'ready',
          result: thermalFemResult(),
        })}
      />,
    )

    const canvas = screen.getByRole('img', {
      name: /Step 2.7 FEM field/,
    })
    const zoom = screen.getByLabelText('Zoom')
    expect(zoom).toHaveAttribute('min', '0.5')
    expect(zoom).toHaveAttribute('max', '4')
    expect(screen.getByText('100%', { selector: 'output' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in FEM field' }))
    expect(screen.getByText('120%', { selector: 'output' })).toBeVisible()
    fireEvent.change(zoom, { target: { value: '4' } })
    expect(screen.getByText('400%', { selector: 'output' })).toBeVisible()
    fireEvent.keyDown(canvas, { key: '0' })
    expect(screen.getByText('100%', { selector: 'output' })).toBeVisible()
    fireEvent.wheel(canvas, { deltaY: -100, clientX: 30, clientY: 30 })
    expect(screen.getByText('120%', { selector: 'output' })).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset FEM field view' }),
    )
    expect(screen.getByText('100%', { selector: 'output' })).toBeVisible()
  })

  test('retains FEM topology while view controls change', () => {
    const buildGeometry = vi.spyOn(
      pandaThermalFemDrawing,
      'buildPandaThermalFemDrawingGeometry',
    )
    render(
      <M1Workspace
        workspace="fem-mesh"
        thermalFem={thermalFemController({
          phase: 'ready',
          result: thermalFemResult(),
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in FEM field' }))
    fireEvent.keyDown(
      screen.getByRole('img', {
        name: /Step 2.7 FEM field/,
      }),
      { key: 'ArrowRight' },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset FEM field view' }),
    )

    expect(buildGeometry).toHaveBeenCalledOnce()
  })

  test('keeps mesh workspace free of field controls', () => {
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

    expect(
      screen.getByRole('heading', {
        name: 'Generalized-plane-strain thermoelastic FEM',
      }),
    ).toBeVisible()
    expect(screen.getByText('M1 · 2D only · Figure 9.1')).toBeVisible()
    expect(
      screen.getByText(/Calculate the PANDA thermoelastic FEM result/),
    ).toBeVisible()
    expect(container.querySelector('canvas')).not.toBeInTheDocument()
    expect(container.querySelector('input')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Displayed field')).not.toBeInTheDocument()
  })
})
