import { describe, expect, test } from 'vitest'

import {
  initialPandaFieldValues,
  type PandaFieldFormValues,
} from './pandaFieldModel'
import {
  isPandaThermalFemResult,
  pandaThermalFemRequestsMatch,
  parsePandaThermalFemValues,
  type PandaThermalFemControls,
  type PandaThermalFemRequest,
  type PandaThermalFemResult,
} from './pandaThermalFemModel'

function values(
  overrides: Partial<PandaFieldFormValues> = {},
): PandaFieldFormValues {
  return { ...initialPandaFieldValues, ...overrides }
}

function controls(
  overrides: Partial<PandaThermalFemControls> = {},
): PandaThermalFemControls {
  return {
    axialCondition: 'free_resultant',
    prescribedForceN: '0',
    prescribedStrainMicrostrain: '0',
    refinementLevel: 1,
    ...overrides,
  }
}

function request(
  options: Partial<PandaThermalFemControls> = {},
): PandaThermalFemRequest {
  const parsed = parsePandaThermalFemValues(values(), controls(options))
  if (parsed.request === null) {
    throw new Error('Expected valid thermal FEM request')
  }
  return parsed.request
}

function mesh(configuration: PandaThermalFemRequest) {
  const nodes = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as [number, number][]
  const elements = [
    [0, 1, 2],
    [1, 3, 2],
    [0, 2, 3],
    [0, 3, 1],
  ] as [number, number, number][]
  return {
    configuration: {
      geometry: configuration.geometry,
      refinement_level: configuration.refinement_level,
    },
    nodes_m: nodes,
    elements,
    region_tags: ['cladding', 'core', 'sap_1', 'sap_2'] as Array<
      'cladding' | 'core' | 'sap_1' | 'sap_2'
    >,
    node_count: 4,
    element_count: 4,
    region_summaries: (['cladding', 'core', 'sap_1', 'sap_2'] as const).map(
      (region) => ({
        region,
        element_count: 1,
        target_area_m2: 1,
        total_area_m2: 1,
      }),
    ),
    quality: {
      minimum_angle_deg: 30,
      minimum_normalized_quality: 0.5,
      mean_normalized_quality: 0.8,
    },
    warnings: [
      {
        code: 'polygonal_interface_approximation' as const,
        message: 'Interfaces are polygonal.',
      },
    ],
    model_manifest: {
      model_id: 'panda_constrained_delaunay_mesh' as const,
      model_version: '1.0.0' as const,
      geometry_model: 'PandaGeometry' as const,
      interface_model: 'piecewise_linear_circular_interfaces' as const,
      method: 'constrained_delaunay' as const,
      element_family: 'first_order_triangles' as const,
      generator_version: 'triangle 20250106' as const,
      fem_compatibility_version: 'scikit-fem 12.0.2' as const,
      quality_target_minimum_angle_deg: 20 as const,
      mesh_only: true as const,
      solved_fem_fields: false as const,
      coordinate_units: 'm' as const,
      assumptions: ['polygonal interfaces'],
      limitations: ['mesh only'],
    },
  }
}

function result(configuration = request()): PandaThermalFemResult {
  return {
    configuration,
    mesh: mesh(configuration),
    displacement_x_m: [0, 0, 0, 0],
    displacement_y_m: [0, 0, 0, 0],
    element_strain_xx: [0, 0, 0, 0],
    element_strain_yy: [0, 0, 0, 0],
    element_strain_zz: [0, 0, 0, 0],
    element_strain_xy: [0, 0, 0, 0],
    element_stress_xx_pa: [0, 0, 0, 0],
    element_stress_yy_pa: [0, 0, 0, 0],
    element_stress_zz_pa: [0, 0, 0, 0],
    element_stress_xy_pa: [0, 0, 0, 0],
    element_principal_max_pa: [0, 0, 0, 0],
    element_principal_min_pa: [0, 0, 0, 0],
    element_principal_difference_pa: [0, 0, 0, 0],
    element_principal_axis_angle_rad: [0, 0, 0, 0],
    element_stress_optic_coefficient_per_pa: [1, 1, 1, 1],
    element_signed_local_material_birefringence: [0, 0, 0, 0],
    element_local_material_birefringence: [0, 0, 0, 0],
    element_local_material_slow_axis_angle_rad: [null, null, null, null],
    epsilon_zz_0: 0,
    core_summary: {
      area_m2: 1,
      average_stress_xx_pa: 0,
      average_stress_yy_pa: 0,
      average_stress_zz_pa: 0,
      average_stress_xy_pa: 0,
      principal_max_pa: 0,
      principal_min_pa: 0,
      principal_difference_pa: 0,
      principal_axis_angle_rad: 0,
      stress_optic_coefficient_per_pa: 1,
      signed_local_material_birefringence: 0,
      local_material_birefringence: 0,
      local_material_slow_axis_angle_rad: null,
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
      transverse_free_residual_l2_n_per_m: 0,
      transverse_resultant_x_n_per_m: 0,
      transverse_resultant_y_n_per_m: 0,
      axial_resultant_n: 0,
      axial_target_n: 0,
      axial_residual_n: 0,
    },
    convergence: [
      {
        refinement_level: 0,
        node_count: 4,
        element_count: 4,
        core_average_principal_difference_pa: 0,
        core_average_local_material_birefringence: 0,
        local_material_birefringence_relative_change: null,
        local_material_birefringence_status: 'unavailable',
        relative_change: null,
        status: 'unavailable',
      },
      {
        refinement_level: 1,
        node_count: 4,
        element_count: 4,
        core_average_principal_difference_pa: 0,
        core_average_local_material_birefringence: 0,
        local_material_birefringence_relative_change: 0,
        local_material_birefringence_status: 'converged',
        relative_change: 0,
        status: 'converged',
      },
    ],
    warnings: [
      {
        code: 'demonstration_data',
        message: 'Demonstration values.',
        refinement_level: null,
      },
      {
        code: 'convergence_unavailable',
        message: 'Level zero is unavailable.',
        refinement_level: 0,
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
      equation_references: ['M1-6.9', 'M1-6.10', 'M1-6.11', 'M1-6.12'],
      birefringence_computed: true,
      birefringence_scope: 'local_material_only',
      birefringence_quantity: 'signed_local_material_index_difference',
      birefringence_units: '1',
      stress_optic_coefficient_units: 'Pa^-1',
      local_not_modal: true,
      assumptions: ['GPS'],
      limitations: [
        'local material stress-optic birefringence is computed without modal propagation',
        'modal phase and group birefringence and beat length are not computed',
      ],
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
  }
}

describe('PANDA thermal FEM model', () => {
  test('parses shared fields for all axial modes and allows valid zero controls', () => {
    const sharedValues = values({
      claddingCteMicroPerK: '0.55',
      sap1CteMicroPerK: '0.55',
      sap2CteMicroPerK: '0.55',
      temperatureC: '20',
      fictiveTemperatureC: '20',
    })
    const free = parsePandaThermalFemValues(sharedValues, controls())
    const force = parsePandaThermalFemValues(
      sharedValues,
      controls({
        axialCondition: 'prescribed_force',
        prescribedForceN: '0.25',
      }),
    )
    const strain = parsePandaThermalFemValues(
      sharedValues,
      controls({
        axialCondition: 'prescribed_strain',
        prescribedStrainMicrostrain: '125',
        refinementLevel: 2,
      }),
    )

    expect(free.request).not.toBeNull()
    expect(free.request?.materials.core.cte_per_k).toBe(0.55e-6)
    expect(free.request?.axial_load).toEqual({
      condition: 'free_resultant',
      prescribed_force_n: null,
      prescribed_strain: null,
    })
    expect(force.request?.axial_load.prescribed_force_n).toBe(0.25)
    expect(strain.request?.axial_load.prescribed_strain).toBe(125e-6)
    expect(strain.request?.refinement_level).toBe(2)
  })

  test('reuses geometry validation and rejects malformed axial controls', () => {
    const badGeometry = parsePandaThermalFemValues(
      values({ sap1CenterXUm: '0', sap2CenterXUm: '0' }),
      controls(),
    )
    const badForce = parsePandaThermalFemValues(
      values(),
      controls({
        axialCondition: 'prescribed_force',
        prescribedForceN: 'not-a-number',
      }),
    )

    expect(badGeometry.request).toBeNull()
    expect(badGeometry.fieldErrors.sap1CenterXUm).toMatch(/overlap/)
    expect(badForce.request).toBeNull()
    expect(badForce.fieldErrors.axialForceN).toMatch(/finite/)
  })

  test('validates the complete nested response contract', () => {
    const valid = result()
    expect(isPandaThermalFemResult(valid)).toBe(true)

    const badArray = structuredClone(valid)
    badArray.element_stress_xy_pa.pop()
    expect(isPandaThermalFemResult(badArray)).toBe(false)

    const badMaterial = structuredClone(valid)
    badMaterial.configuration.materials.core.source.notes = 4 as never
    expect(isPandaThermalFemResult(badMaterial)).toBe(false)

    const badMesh = structuredClone(valid)
    badMesh.mesh.quality.mean_normalized_quality = 2
    expect(isPandaThermalFemResult(badMesh)).toBe(false)

    const badManifest = structuredClone(valid)
    badManifest.model_manifest.stress_units = 'MPa' as never
    expect(isPandaThermalFemResult(badManifest)).toBe(false)

    const badConvergence = structuredClone(valid)
    badConvergence.convergence[1].node_count = 3
    expect(isPandaThermalFemResult(badConvergence)).toBe(false)

    const badConfiguration = structuredClone(valid)
    badConfiguration.configuration.refinement_level = 2
    expect(isPandaThermalFemResult(badConfiguration)).toBe(false)
  })

  test('rejects invalid local material optics and comparison states', () => {
    const valid = result()

    const badMagnitude = structuredClone(valid)
    badMagnitude.element_local_material_birefringence[0] = -1
    expect(isPandaThermalFemResult(badMagnitude)).toBe(false)

    const badAngle = structuredClone(valid)
    badAngle.element_local_material_slow_axis_angle_rad[0] = Math.PI / 2
    expect(isPandaThermalFemResult(badAngle)).toBe(false)

    const badLength = structuredClone(valid)
    badLength.element_local_material_slow_axis_angle_rad.pop()
    expect(isPandaThermalFemResult(badLength)).toBe(false)

    const badManifest = structuredClone(valid)
    badManifest.model_manifest.local_not_modal = false as never
    expect(isPandaThermalFemResult(badManifest)).toBe(false)

    const badComparison = structuredClone(valid)
    badComparison.qualitative_kernel_fem_shape_comparison.available = true
    expect(isPandaThermalFemResult(badComparison)).toBe(false)

    const badComparisonLimit = structuredClone(valid)
    badComparisonLimit.qualitative_kernel_fem_shape_comparison.limitations = [
      'quantitative stress comparison',
    ]
    expect(isPandaThermalFemResult(badComparisonLimit)).toBe(false)

    const badComparisonRmse = structuredClone(valid)
    badComparisonRmse.qualitative_kernel_fem_shape_comparison = {
      ...badComparisonRmse.qualitative_kernel_fem_shape_comparison,
      available: true,
      sample_count: 2,
      kernel_scale: 1,
      fem_signed_deviatoric_stress_scale_pa: 1,
      best_polarity: 1,
      rmse: 2.01,
      correlation: null,
      sign_agreement: 0.5,
      unavailable_reason: null,
    }
    expect(isPandaThermalFemResult(badComparisonRmse)).toBe(false)

    const badLocalConvergence = structuredClone(valid)
    badLocalConvergence.convergence[1].local_material_birefringence_status =
      'unavailable'
    expect(isPandaThermalFemResult(badLocalConvergence)).toBe(false)
  })

  test('accepts undefined slow axes without changing the local material values', () => {
    const valid = result()
    valid.element_signed_local_material_birefringence[0] = 0.25
    valid.element_local_material_birefringence[0] = 0.25
    valid.element_local_material_slow_axis_angle_rad[0] = null

    expect(isPandaThermalFemResult(valid)).toBe(true)
    expect(valid.element_local_material_slow_axis_angle_rad[0]).toBeNull()
  })

  test('matches the exact FEM request configuration', () => {
    const first = request()
    const second = structuredClone(first)
    second.thermal.temperature_k += 1

    expect(pandaThermalFemRequestsMatch(first, first)).toBe(true)
    expect(pandaThermalFemRequestsMatch(first, second)).toBe(false)
    expect(isPandaThermalFemResult(result(first))).toBe(true)
  })
})
