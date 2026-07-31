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
    })
    expect(fetchMock).not.toHaveBeenCalled()

    act(() => {
      result.current.onCalculate()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      refinement_level: number
      axial_load: { condition: string; prescribed_force_n: number }
    }
    expect(request.refinement_level).toBe(2)
    expect(request.axial_load).toEqual({
      condition: 'prescribed_force',
      prescribed_force_n: 0.25,
      prescribed_strain: null,
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
})
