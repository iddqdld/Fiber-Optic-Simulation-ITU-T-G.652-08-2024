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
    lateralPressureMPa: '0',
    wavelengthNm: '1550',
    gaussianModeFieldRadiusUm: '5',
    torsionCapability: 'none',
    torsionInputMode: 'twist_rate',
    twistRatePerM: '0',
    appliedTorqueNm: '0',
    ...overrides,
  }
}

function request(
  options: Partial<PandaThermalFemControls> = {},
): PandaThermalFemRequest {
  const parsed = parsePandaThermalFemValues(values(), controls(options))
  if (parsed.request === null) throw new Error('Expected valid request')
  return parsed.request
}

function mesh(configuration: PandaThermalFemRequest) {
  return {
    configuration: {
      geometry: configuration.geometry,
      refinement_level: configuration.refinement_level,
    },
    nodes_m: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as [number, number][],
    elements: [
      [0, 1, 2],
      [1, 3, 2],
      [0, 2, 3],
      [0, 3, 1],
    ] as [number, number, number][],
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
    warnings: [],
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
      assumptions: ['test'],
      limitations: ['test'],
    },
  }
}

function stressSummary() {
  return {
    area_m2: 1,
    average_stress_xx_pa: 1,
    average_stress_yy_pa: -1,
    average_stress_zz_pa: 0,
    average_stress_xy_pa: 0,
    principal_difference_pa: 2,
    principal_axis_angle_rad: 0,
  }
}

function zeroStressSummary() {
  return {
    ...stressSummary(),
    average_stress_xx_pa: 0,
    average_stress_yy_pa: 0,
    principal_difference_pa: 0,
  }
}

function modalEstimate(): PandaThermalFemResult['optical_birefringence']['pressure_induced'] {
  const signedPhaseBirefringence = 4e-6
  const wavelengthM = 1.55e-6
  return {
    state_1_index_shift: 2e-6,
    state_2_index_shift: -2e-6,
    common_index_shift: 0,
    signed_phase_birefringence: signedPhaseBirefringence,
    phase_birefringence_magnitude: Math.abs(signedPhaseBirefringence),
    signed_delta_beta_per_m:
      ((2 * Math.PI) / wavelengthM) * signedPhaseBirefringence,
    beat_length_m: wavelengthM / Math.abs(signedPhaseBirefringence),
    beat_length_status: 'finite',
    state_1_axis_angle_rad: 0,
    state_2_axis_angle_rad: Math.PI / 2 - 0.01,
    slow_axis_angle_rad: 0,
    perturbation_matrix: [
      [2e-6, 0],
      [0, -2e-6],
    ],
    eigenvalue_shifts: [-2e-6, 2e-6],
    signed_convention:
      'state_1_is_unoriented_eigenaxis_closest_to_global_positive_x',
  }
}

function zeroModalEstimate(): PandaThermalFemResult['optical_birefringence']['pressure_induced'] {
  return {
    state_1_index_shift: 0,
    state_2_index_shift: 0,
    common_index_shift: 0,
    signed_phase_birefringence: 0,
    phase_birefringence_magnitude: 0,
    signed_delta_beta_per_m: 0,
    beat_length_m: null,
    beat_length_status: 'undefined within numerical tolerance',
    state_1_axis_angle_rad: null,
    state_2_axis_angle_rad: null,
    slow_axis_angle_rad: null,
    perturbation_matrix: [
      [0, 0],
      [0, 0],
    ],
    eigenvalue_shifts: [0, 0],
    signed_convention:
      'state_1_is_unoriented_eigenaxis_closest_to_global_positive_x',
  }
}

function manifest() {
  return {
    model_id: 'fem_generalized_plane_strain' as const,
    model_version: '1.2.0' as const,
    method: 'fem_generalized_plane_strain' as const,
    stress_measure: 'cauchy_stress' as const,
    quantity_type: 'quantitative_mechanical_output' as const,
    stress_units: 'Pa' as const,
    displacement_units: 'm' as const,
    strain_units: '1' as const,
    exterior_boundary_model:
      'traction_free_at_zero_pressure_or_prescribed_bare_glass_lateral_pressure' as const,
    element_family: 'first_order_triangles' as const,
    axial_strain_model: 'uniform_epsilon_zz_0' as const,
    equation: 'transverse_weak_equilibrium_plus_axial_resultant' as const,
    axial_equation: 'integral_sigma_zz_d_a_equals_n_z' as const,
    axial_conditions: [
      'free_resultant',
      'prescribed_force',
      'prescribed_strain',
    ],
    thermal_strain_model: 'full_per_region_alpha_delta_t' as const,
    equation_references: [
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
    ],
    birefringence_computed: true as const,
    birefringence_scope:
      'local_material_and_first_order_scalar_lp01_phase' as const,
    birefringence_quantity:
      'signed_local_and_modal_phase_index_differences' as const,
    birefringence_units: '1' as const,
    stress_optic_coefficient_units: 'Pa^-1' as const,
    local_not_modal: true as const,
    modal_phase_estimate_computed: true as const,
    modal_phase_estimate_method:
      'First-order scalar LP₀₁ photoelastic phase-birefringence estimate.' as const,
    pressure_boundary_model:
      'bare_glass_lateral_pressure_when_requested' as const,
    pressure_units: 'Pa' as const,
    pressure_sign_convention: 'sigma_n_equals_minus_p_n' as const,
    pressure_scope: 'uncoated_outer_glass_boundary' as const,
    pressure_exclusions: [
      'coating mechanics are outside the model',
      'support contact is outside the model',
      'load transfer through packaging is outside the model',
    ],
    free_resultant_scope: 'ends_not_pressure_loaded' as const,
    hydrostatic_end_face_loading:
      'requires_changed_axial_loading_condition' as const,
    hydrostatic_limitation:
      'pressure_on_end_faces_requires_changing_the_axial_loading_condition' as const,
    optical_mode_model:
      'degenerate_gaussian_lp01_scalar_weak_guidance' as const,
    optical_perturbation_matrix: 'real_symmetric_2x2_hermitian' as const,
    moving_boundary_contribution: 'not_included' as const,
    vector_mode_validation: 'not_validated' as const,
    group_birefringence: 'unavailable_single_wavelength' as const,
    torsion_capabilities: [
      'none',
      'saint_venant_homogeneous_circular_reference',
    ],
    assumptions: [
      'small strain isotropic thermoelasticity',
      'generalized plane strain with uniform axial strain',
      'zero xz and yz shear strains',
      'piecewise constant material data per mesh element',
      'traction-free exterior with no imposed exterior displacement when pressure is zero',
      'positive pressure is lateral pressure acting directly on a bare fibre',
      'free axial resultant means that fibre ends are not pressure-loaded',
      'controlled rigid-body anchors only',
    ],
    limitations: [
      'material and thermal values may be demonstration data rather than measured fibre data',
      'first-order triangles provide a mesh-dependent approximation',
      'local material stress-optic birefringence is computed without modal propagation',
      'the scalar modal estimate is not a validated vector-mode solution',
      'modal phase birefringence is a first-order estimate',
      'moving-boundary and deformed-waveguide contributions are not included',
      'group birefringence needs wavelength-dependent material data and recalculated modal fields',
      'torsion is an analytical homogeneous circular benchmark and is not PANDA torsion',
      'demonstration material coefficients are not validated fibre measurements',
    ],
  }
}

function result(configuration = request()): PandaThermalFemResult {
  const values = () => [0, 0, 0, 0]
  const meshResult = mesh(configuration)
  return {
    configuration,
    mesh: meshResult,
    displacement_x_m: [0, 0, 0, 0],
    displacement_y_m: [0, 0, 0, 0],
    element_strain_xx: values(),
    element_strain_yy: values(),
    element_strain_zz: values(),
    element_strain_xy: values(),
    element_stress_xx_pa: values(),
    element_stress_yy_pa: values(),
    element_stress_zz_pa: values(),
    element_stress_xy_pa: values(),
    element_pressure_increment_stress_xx_pa: values(),
    element_pressure_increment_stress_yy_pa: values(),
    element_pressure_increment_stress_zz_pa: values(),
    element_pressure_increment_stress_xy_pa: values(),
    element_principal_max_pa: values(),
    element_principal_min_pa: values(),
    element_principal_difference_pa: values(),
    element_principal_axis_angle_rad: values(),
    element_stress_optic_coefficient_per_pa: [1, 1, 1, 1],
    element_signed_local_material_birefringence: values(),
    element_local_material_birefringence: values(),
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
    baseline_core_summary: stressSummary(),
    pressure_increment_core_summary: zeroStressSummary(),
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
        pressure_induced_phase_birefringence: 0,
        pressure_induced_phase_birefringence_relative_change: null,
        pressure_induced_phase_birefringence_status: 'unavailable',
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
        pressure_induced_phase_birefringence: 0,
        pressure_induced_phase_birefringence_relative_change: 0,
        pressure_induced_phase_birefringence_status: 'converged',
        relative_change: 0,
        status: 'converged',
      },
    ],
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
    optical_birefringence: {
      method:
        'First-order scalar LP₀₁ photoelastic phase-birefringence estimate.',
      scalar_weak_guidance_estimate: true,
      validated_vector_mode_solution: false,
      moving_boundary_or_deformed_waveguide_included: false,
      zero_pressure_residual: modalEstimate(),
      total_combined: modalEstimate(),
      pressure_induced: zeroModalEstimate(),
      group_birefringence: {
        available: false,
        value: null,
        reason: 'wavelength_dependent_inputs_unavailable',
        requirements: [
          'wavelength-dependent material refractive indices',
          'wavelength-dependent photoelastic coefficients when relevant',
          'modal fields recalculated at each wavelength',
        ],
      },
    },
    torsion: {
      capability: 'none',
      analytical_mechanics_benchmark_only: true,
      heterogeneous_panda_torsion: false,
      polarization_coupling_included: false,
      used_in_transverse_scalar_optical_model: false,
      input_mode: null,
      twist_rate_per_m: 0,
      applied_torque_n_m: 0,
      shear_modulus_pa: 1,
      polar_moment_m4: 1,
      reference_radius_m: 1,
      element_centroid_stress_xz_pa: values(),
      element_centroid_stress_yz_pa: values(),
      maximum_boundary_shear_pa: 0,
    },
    warnings: [],
    model_manifest: manifest(),
  }
}

describe('PANDA thermal FEM 1.2.0 model', () => {
  test('converts pressure, optical mode, and torsion controls exactly', () => {
    const parsed = parsePandaThermalFemValues(
      values(),
      controls({
        lateralPressureMPa: '2.5',
        wavelengthNm: '1310',
        gaussianModeFieldRadiusUm: '4.75',
        torsionCapability: 'saint_venant_homogeneous_circular_reference',
        torsionInputMode: 'applied_torque',
        appliedTorqueNm: '0',
      }),
    )
    expect(parsed.fieldErrors).toEqual({})
    expect(parsed.request?.lateral_pressure_pa).toBe(2.5e6)
    expect(parsed.request?.optical_mode?.wavelength_m).toBeCloseTo(1310e-9, 18)
    expect(
      parsed.request?.optical_mode?.gaussian_mode_field_radius_m,
    ).toBeCloseTo(4.75e-6, 18)
    expect(parsed.request?.torsion).toMatchObject({
      capability: 'saint_venant_homogeneous_circular_reference',
      input_mode: 'applied_torque',
      applied_torque_n_m: 0,
      twist_rate_per_m: null,
    })
  })

  test('preserves geometry and all generalized-plane-strain axial modes', () => {
    const free = parsePandaThermalFemValues(values(), controls())
    const force = parsePandaThermalFemValues(
      values(),
      controls({
        axialCondition: 'prescribed_force',
        prescribedForceN: '0.25',
      }),
    )
    const strain = parsePandaThermalFemValues(
      values(),
      controls({
        axialCondition: 'prescribed_strain',
        prescribedStrainMicrostrain: '125',
        refinementLevel: 2,
      }),
    )

    expect(free.request?.axial_load).toEqual({
      condition: 'free_resultant',
      prescribed_force_n: null,
      prescribed_strain: null,
    })
    expect(force.request?.axial_load.prescribed_force_n).toBe(0.25)
    expect(strain.request?.axial_load.prescribed_strain).toBe(125e-6)
    expect(strain.request?.refinement_level).toBe(2)

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

  test('rejects invalid positive-only controls and keeps torsion input exclusive', () => {
    const parsed = parsePandaThermalFemValues(
      values(),
      controls({
        lateralPressureMPa: '-1',
        wavelengthNm: '0',
        gaussianModeFieldRadiusUm: '-2',
        torsionCapability: 'saint_venant_homogeneous_circular_reference',
        torsionInputMode: 'twist_rate',
        twistRatePerM: '',
      }),
    )
    expect(parsed.request).toBeNull()
    expect(parsed.fieldErrors.lateralPressureMPa).toMatch(/non-negative/)
    expect(parsed.fieldErrors.wavelengthNm).toMatch(/positive/)
    expect(parsed.fieldErrors.gaussianModeFieldRadiusUm).toMatch(/positive/)
    expect(parsed.fieldErrors.twistRatePerM).toMatch(/finite/)
  })

  test('accepts and rejects the complete strict 1.2.0 response contract', () => {
    const valid = result()
    expect(isPandaThermalFemResult(valid)).toBe(true)

    const badPressureArray = structuredClone(valid)
    badPressureArray.element_pressure_increment_stress_xy_pa.pop()
    expect(isPandaThermalFemResult(badPressureArray)).toBe(false)

    const badManifest = structuredClone(valid)
    badManifest.model_manifest.model_version = '1.1.0' as never
    expect(isPandaThermalFemResult(badManifest)).toBe(false)

    const badOptics = structuredClone(valid)
    badOptics.optical_birefringence.group_birefringence.available =
      true as never
    expect(isPandaThermalFemResult(badOptics)).toBe(false)

    const badTorsion = structuredClone(valid)
    badTorsion.torsion.polarization_coupling_included = true as never
    expect(isPandaThermalFemResult(badTorsion)).toBe(false)

    const badMaterial = structuredClone(valid)
    badMaterial.configuration.materials.core.source.notes = 4 as never
    expect(isPandaThermalFemResult(badMaterial)).toBe(false)

    const badMesh = structuredClone(valid)
    badMesh.mesh.quality.mean_normalized_quality = 2
    expect(isPandaThermalFemResult(badMesh)).toBe(false)

    const badConvergence = structuredClone(valid)
    badConvergence.convergence[1].node_count = 3
    expect(isPandaThermalFemResult(badConvergence)).toBe(false)

    const badConfiguration = structuredClone(valid)
    badConfiguration.configuration.refinement_level = 2
    expect(isPandaThermalFemResult(badConfiguration)).toBe(false)
  })

  test('rejects malformed local, comparison, modal, and torsion states', () => {
    const badMagnitude = result()
    badMagnitude.element_local_material_birefringence[0] = -1
    expect(isPandaThermalFemResult(badMagnitude)).toBe(false)

    const badSlowAxis = result()
    badSlowAxis.element_local_material_slow_axis_angle_rad[0] = Math.PI / 2
    expect(isPandaThermalFemResult(badSlowAxis)).toBe(false)

    const badPrincipalAxis = result()
    badPrincipalAxis.element_principal_axis_angle_rad[0] = Math.PI
    expect(isPandaThermalFemResult(badPrincipalAxis)).toBe(false)

    const badComparison = result()
    badComparison.qualitative_kernel_fem_shape_comparison.limitations = [
      'wrong',
    ]
    expect(isPandaThermalFemResult(badComparison)).toBe(false)

    const badModal = result()
    badModal.optical_birefringence.total_combined.signed_delta_beta_per_m = 4
    expect(isPandaThermalFemResult(badModal)).toBe(false)

    const benchmarkRequest = request({
      torsionCapability: 'saint_venant_homogeneous_circular_reference',
      torsionInputMode: 'twist_rate',
      twistRatePerM: '0',
    })
    const badTorsion = result(benchmarkRequest)
    badTorsion.torsion = {
      ...badTorsion.torsion,
      capability: 'saint_venant_homogeneous_circular_reference',
      input_mode: null,
    }
    expect(isPandaThermalFemResult(badTorsion)).toBe(false)
  })

  test('accepts undefined local axes without weakening local values', () => {
    const valid = result()
    valid.element_signed_local_material_birefringence[0] = 0.25
    valid.element_local_material_birefringence[0] = 0.25
    valid.element_local_material_slow_axis_angle_rad[0] = null

    expect(isPandaThermalFemResult(valid)).toBe(true)
  })

  test('matches the exact outgoing request and reports undefined zero beat length', () => {
    const first = request()
    const second = structuredClone(first)
    second.lateral_pressure_pa = 1
    expect(pandaThermalFemRequestsMatch(first, first)).toBe(true)
    expect(pandaThermalFemRequestsMatch(first, second)).toBe(false)

    const zero = result()
    zero.optical_birefringence.pressure_induced = zeroModalEstimate()
    expect(isPandaThermalFemResult(zero)).toBe(true)
  })
})
