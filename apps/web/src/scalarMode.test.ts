import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { components } from '../../../packages/shared_schemas/generated/api'
import {
  isScalarLPModeCatalog,
  isScalarLPModeFieldResult,
  type ScalarLPModeCatalog,
  type ScalarLPModeFamily,
  type ScalarLPModeFieldResult,
} from './scalarMode'
import { useScalarModeField } from './useScalarModeField'

type ScalarLPModeManifest = components['schemas']['ScalarLPModeManifest']

const manifest = {
  model_id: 'scalar_lp_step_index_modes',
  model_version: '1.0.0',
  catalog_label: 'Supported scalar LP modes — weak-guidance step-index model',
  field_label: 'Scalar LP mode field — weak-guidance step-index model',
  field_normalization: 'unit_peak_absolute_field',
  angular_basis: 'cosine_representative',
  excitation_status: 'not_calculated',
  assumptions: ['scalar weak-guidance LP mode equation'],
  limitations: ['supported modes are not necessarily excited by the source'],
} satisfies ScalarLPModeManifest

const wavelengthM = 1.55e-6
const nCore = 1.47
const nCladding = 1.465
const vNumber = 3
const coreRadiusM =
  (vNumber * wavelengthM) /
  (2 * Math.PI * Math.sqrt(nCore ** 2 - nCladding ** 2))

function mode(
  label: 'LP01' | 'LP11',
  azimuthalOrder: number,
  cutoffV: number,
  uValue: number,
): ScalarLPModeFamily {
  const wValue = Math.sqrt(vNumber ** 2 - uValue ** 2)
  const effectiveIndex = label === 'LP01' ? 1.468 : 1.4665
  return {
    label,
    azimuthal_order: azimuthalOrder,
    radial_order: 1,
    spatial_degeneracy: azimuthalOrder === 0 ? 1 : 2,
    cutoff_v_dimensionless: cutoffV,
    v_number_dimensionless: vNumber,
    u_dimensionless: uValue,
    w_dimensionless: wValue,
    normalized_propagation_constant: (wValue / vNumber) ** 2,
    effective_index_dimensionless: effectiveIndex,
    beta_per_m: ((2 * Math.PI) / wavelengthM) * effectiveIndex,
  }
}

const lp01 = mode('LP01', 0, 0, 2)
const lp11 = mode('LP11', 1, 2.4048255577, 2.5)

const catalog = {
  wavelength_m: wavelengthM,
  core_radius_m: coreRadiusM,
  n_core: nCore,
  n_cladding: nCladding,
  v_number_dimensionless: vNumber,
  mode_regime: 'multimode',
  mode_families: [lp01, lp11],
  catalog_truncated: false,
  warnings: [],
  model_manifest: manifest,
} satisfies ScalarLPModeCatalog

const normalizedField = [
  [-0.5, 0, 0.5],
  [-1, 0, 1],
  [-0.5, 0, 0.5],
]

const fieldResult = {
  wavelength_m: catalog.wavelength_m,
  core_radius_m: catalog.core_radius_m,
  n_core: catalog.n_core,
  n_cladding: catalog.n_cladding,
  selected_mode: lp11,
  grid_half_width_m: 2e-6,
  grid_points: 3,
  x_m: [-2e-6, 0, 2e-6],
  y_m: [-2e-6, 0, 2e-6],
  normalized_field: normalizedField,
  normalized_intensity: normalizedField.map((row) =>
    row.map((value) => value ** 2),
  ),
  model_manifest: manifest,
} satisfies ScalarLPModeFieldResult

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('scalar LP mode contracts', () => {
  test('accepts a supported catalog without treating support as excitation', () => {
    expect(isScalarLPModeCatalog(catalog)).toBe(true)
    expect(catalog.model_manifest.excitation_status).toBe('not_calculated')
    expect(catalog.mode_families.map((item) => item.label)).toEqual([
      'LP01',
      'LP11',
    ])
  })

  test('accepts a signed unit-peak field and rejects intensity mismatch', () => {
    expect(isScalarLPModeFieldResult(fieldResult)).toBe(true)
    expect(
      isScalarLPModeFieldResult({
        ...fieldResult,
        normalized_intensity: [
          [0.25, 0, 0.25],
          [1, 0.5, 1],
          [0.25, 0, 0.25],
        ],
      }),
    ).toBe(false)
  })

  test('calculates only the selected mode field on demand', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(fieldResult),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ selected }: { selected: ScalarLPModeFamily | null }) =>
        useScalarModeField(catalog, selected, 2, 3),
      { initialProps: { selected: null as ScalarLPModeFamily | null } },
    )

    expect(result.current.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()

    rerender({ selected: lp11 })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/modes/scalar-lp/field',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      wavelength_m: catalog.wavelength_m,
      core_radius_m: catalog.core_radius_m,
      n_core: catalog.n_core,
      n_cladding: catalog.n_cladding,
      azimuthal_order: 1,
      radial_order: 1,
      grid_half_width_m: 2e-6,
      grid_points: 3,
    })
    expect(result.current.data?.selectedMode.label).toBe('LP11')
    expect(result.current.data?.normalizedField[1]).toEqual([-1, 0, 1])
  })

  test('aborts a stale field request when the selection is cleared', async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => undefined))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(
      ({ selected }: { selected: ScalarLPModeFamily | null }) =>
        useScalarModeField(catalog, selected, 2, 3),
      { initialProps: { selected: lp11 as ScalarLPModeFamily | null } },
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal

    rerender({ selected: null })

    expect(signal.aborted).toBe(true)
    expect(result.current.status).toBe('idle')
    expect(result.current.data).toBeNull()
  })
})
