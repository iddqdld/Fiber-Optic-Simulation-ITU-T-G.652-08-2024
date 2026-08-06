import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { usePandaThermalFem } from './usePandaThermalFem'

describe('usePandaThermalFem', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('calculates only after an explicit action', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => usePandaThermalFem(true))

    expect(fetchMock).not.toHaveBeenCalled()
    act(() => {
      result.current.onRefinementLevelChange(2)
      result.current.onAxialConditionChange('prescribed_force')
      result.current.onPrescribedForceChange('0.25')
      result.current.onLateralPressureMPaChange('1.5')
      result.current.onWavelengthNmChange('1310')
      result.current.onGaussianModeFieldRadiusUmChange('4.5')
      result.current.onTorsionCapabilityChange(
        'saint_venant_homogeneous_circular_reference',
      )
      result.current.onTorsionInputModeChange('applied_torque')
      result.current.onAppliedTorqueNmChange('0')
    })
    expect(fetchMock).not.toHaveBeenCalled()

    act(() => {
      result.current.onCalculate()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      refinement_level: number
      axial_load: { condition: string; prescribed_force_n: number }
      lateral_pressure_pa: number
      optical_mode: {
        wavelength_m: number
        gaussian_mode_field_radius_m: number
      }
      torsion: {
        capability: string
        input_mode: string
        applied_torque_n_m: number
      }
    }
    expect(request.refinement_level).toBe(2)
    expect(request.axial_load).toEqual({
      condition: 'prescribed_force',
      prescribed_force_n: 0.25,
      prescribed_strain: null,
    })
    expect(request.lateral_pressure_pa).toBe(1.5e6)
    expect(request.optical_mode.wavelength_m).toBeCloseTo(1310e-9, 18)
    expect(request.optical_mode.gaussian_mode_field_radius_m).toBeCloseTo(
      4.5e-6,
      18,
    )
    expect(request.torsion).toEqual({
      capability: 'saint_venant_homogeneous_circular_reference',
      input_mode: 'applied_torque',
      twist_rate_per_m: null,
      applied_torque_n_m: 0,
    })
    await waitFor(() => expect(result.current.phase).toBe('error'))
  })

  test('aborts an in-flight calculation when configuration changes', async () => {
    let rejectRequest: ((reason?: unknown) => void) | undefined
    const fetchMock = vi.fn().mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          rejectRequest = reject
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => usePandaThermalFem(true))

    act(() => {
      result.current.onCalculate()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    act(() => {
      result.current.onRefinementLevelChange(2)
    })

    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(
      true,
    )
    rejectRequest?.()
  })

  test('ignores a late response from an obsolete calculation', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => usePandaThermalFem(true))

    act(() => {
      result.current.onCalculate()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    act(() => {
      result.current.onLateralPressureMPaChange('2')
    })
    await act(async () => {
      resolveRequest?.(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      await Promise.resolve()
    })

    expect(result.current.phase).toBe('idle')
    expect(result.current.result).toBeNull()
    expect(result.current.errorMessage).toBeNull()
  })
})
