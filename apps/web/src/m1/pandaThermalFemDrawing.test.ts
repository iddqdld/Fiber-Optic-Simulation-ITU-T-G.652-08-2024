import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createElement } from 'react'

import { PandaThermalFemCanvas } from './PandaThermalFemCanvas'
import {
  buildPandaThermalFemDrawingGeometry,
  buildThermalFemDisplayScale,
  DEFAULT_THERMAL_FEM_FIELD,
  getThermalFemFieldValues,
  thermalFemBinIndex,
  type PandaThermalFemResult,
} from './pandaThermalFemDrawing'

const canvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
  fillStyle: '',
  lineWidth: 1,
  strokeStyle: '',
  setTransform: vi.fn(),
}

class MockPath2D {
  moveTo = vi.fn()
  lineTo = vi.fn()
  closePath = vi.fn()
}

function result(): PandaThermalFemResult {
  return {
    configuration: {
      geometry: {
        core_radius_m: 4.1e-6,
        cladding_radius_m: 62.5e-6,
        core_center_x_m: 0,
        core_center_y_m: 0,
        sap_1: { radius_m: 15e-6, center_x_m: -30e-6, center_y_m: 0 },
        sap_2: { radius_m: 15e-6, center_x_m: 30e-6, center_y_m: 0 },
      },
      materials: {} as PandaThermalFemResult['configuration']['materials'],
      thermal: {} as PandaThermalFemResult['configuration']['thermal'],
      axial_load: {} as PandaThermalFemResult['configuration']['axial_load'],
      refinement_level: 0,
    },
    mesh: {
      configuration: {} as PandaThermalFemResult['mesh']['configuration'],
      nodes_m: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
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
      quality: {} as PandaThermalFemResult['mesh']['quality'],
      warnings: [],
      model_manifest: {} as PandaThermalFemResult['mesh']['model_manifest'],
    },
    displacement_x_m: [-2e-6, -1e-6, 1e-6, 2e-6, 0],
    displacement_y_m: [1e-6, 2e-6, -2e-6, -1e-6, 0],
    element_strain_xx: [-1, -0.5, 0.5, 1],
    element_strain_yy: [-2, -1, 1, 2],
    element_strain_zz: [-3, -1.5, 1.5, 3],
    element_strain_xy: [-4, -2, 2, 4],
    element_stress_xx_pa: [-2e6, -1e6, 1e6, 2e6],
    element_stress_yy_pa: [-4e6, -2e6, 2e6, 4e6],
    element_stress_zz_pa: [-6e6, -3e6, 3e6, 6e6],
    element_stress_xy_pa: [-8e6, -4e6, 4e6, 8e6],
    element_principal_max_pa: [-10e6, -5e6, 5e6, 10e6],
    element_principal_min_pa: [-12e6, -6e6, 6e6, 12e6],
    element_principal_difference_pa: [0, 2e6, 4e6, 6e6],
    element_principal_axis_angle_rad: [0, 0, 0, 0],
    element_stress_optic_coefficient_per_pa: [1, 1, 1, 1],
    element_signed_local_material_birefringence: [-0.4, -0.1, 0.2, 0.6],
    element_local_material_birefringence: [0.4, 0.1, 0.2, 0.6],
    element_local_material_slow_axis_angle_rad: [null, 0, Math.PI / 4, null],
    epsilon_zz_0: 0,
    core_summary: {} as PandaThermalFemResult['core_summary'],
    anchor_reactions: {} as PandaThermalFemResult['anchor_reactions'],
    force_balance: {} as PandaThermalFemResult['force_balance'],
    convergence: [],
    warnings: [],
    model_manifest: {} as PandaThermalFemResult['model_manifest'],
    qualitative_kernel_fem_shape_comparison:
      {} as PandaThermalFemResult['qualitative_kernel_fem_shape_comparison'],
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

describe('PANDA thermal FEM drawing', () => {
  test('uses nonnegative MPa scale for the default principal difference', () => {
    const model = result()
    const scale = buildThermalFemDisplayScale(model, DEFAULT_THERMAL_FEM_FIELD)

    expect(scale).toEqual({
      kind: 'nonnegative',
      minimum: 0,
      maximum: 6,
      unit: 'MPa',
      conversion: 'Pa × 1e−6',
    })
    expect(thermalFemBinIndex(0, scale)).toBe(0)
    expect(thermalFemBinIndex(6, scale)).toBe(20)
  })

  test('uses symmetric scale and retained 21-bin paths for signed values', () => {
    const model = result()
    const scale = buildThermalFemDisplayScale(model, 'element_stress_xy_pa')
    const geometry = buildPandaThermalFemDrawingGeometry(
      model,
      'element_stress_xy_pa',
    )

    expect(scale.minimum).toBe(-8)
    expect(scale.maximum).toBe(8)
    expect(thermalFemBinIndex(-8, scale)).toBe(0)
    expect(thermalFemBinIndex(0, scale)).toBe(10)
    expect(thermalFemBinIndex(8, scale)).toBe(20)
    expect(geometry.bins).toHaveLength(21)
    expect(geometry.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(4)
    expect(geometry.interfaceEdgeCount).toBeGreaterThan(0)
    expect(geometry.outerEdgeCount).toBeGreaterThan(0)
  })

  test('averages nodal displacement onto every rendered element', () => {
    const model = result()
    const values = getThermalFemFieldValues(model, 'displacement_x_m')
    const geometry = buildPandaThermalFemDrawingGeometry(
      model,
      'displacement_x_m',
    )

    expect(values).toEqual([-1e-6, 0, 1e-6, 0])
    expect(geometry.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(4)
  })

  test('keeps null slow-axis samples undefined and omits their triangles', () => {
    const model = result()
    const values = getThermalFemFieldValues(
      model,
      'element_local_material_slow_axis_angle_rad',
    )
    const geometry = buildPandaThermalFemDrawingGeometry(
      model,
      'element_local_material_slow_axis_angle_rad',
    )

    expect(values).toEqual([null, 0, Math.PI / 4, null])
    expect(geometry.scale).toEqual({
      kind: 'orientation',
      minimum: -90,
      maximum: 90,
      unit: '°',
      conversion: 'rad × 180/π; undefined samples omitted',
    })
    expect(geometry.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(2)
    expect(geometry.bins[0].color).toBe(geometry.bins.at(-1)?.color)
  })

  test('renders accessible quantity, units, conversion, and mechanical caption', () => {
    render(createElement(PandaThermalFemCanvas, { result: result() }))

    expect(screen.getByLabelText('FEM quantity')).toHaveValue(
      'element_principal_difference_pa',
    )
    expect(screen.getAllByText(/Pa × 1e−6/)).not.toHaveLength(0)
    expect(screen.getByText(/quantitative mechanical FEM/i)).toBeVisible()
    expect(
      screen.getByText(/not modal Bp.*beat length are not calculated/i),
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('FEM quantity'), {
      target: { value: 'element_signed_local_material_birefringence' },
    })
    expect(screen.getByText('dimensionless; unchanged')).toBeVisible()
    expect(screen.getByText('Δn')).toBeVisible()
    fireEvent.change(screen.getByLabelText('FEM quantity'), {
      target: { value: 'element_local_material_slow_axis_angle_rad' },
    })
    expect(screen.getByText(/undefined samples omitted/)).toBeVisible()
  })
})
