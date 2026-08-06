import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { usePandaFieldMap } from './usePandaFieldMap'

describe('usePandaFieldMap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('does not request a field while the workspace is inactive', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => usePandaFieldMap(false))

    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('requests the valid field after the debounce interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => usePandaFieldMap(true))

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/v1/photoelastic/panda/field-map',
    )
    expect(result.current.phase).toBe('error')
    expect(result.current.errorMessage).toBe(
      'PANDA field service returned a malformed response.',
    )
  })

  test('does not request an invalid geometry', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => usePandaFieldMap(true))

    act(() => {
      result.current.onValueChange('coreRadiusUm', '-1')
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('validation')
    expect(result.current.result).toBeNull()
  })

  test('aborts an old request when an input changes', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => usePandaFieldMap(true))

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.onValueChange('sap1RadiusUm', '14')
    })

    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(
      true,
    )
    expect(result.current.result).toBeNull()
  })
})
