import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  initialPandaFieldValues,
  type PandaFieldFormValues,
} from './pandaFieldModel'
import {
  parsePandaMeshGeometry,
  type PandaMeshRefinementLevel,
  type PandaMeshRequest,
  type PandaMeshResult,
} from './pandaMeshModel'
import { usePandaMesh } from './usePandaMesh'

type HookProps = {
  active: boolean
  values: PandaFieldFormValues
  refinementLevel: PandaMeshRefinementLevel
}

function meshRequest(
  refinementLevel: PandaMeshRefinementLevel,
): PandaMeshRequest {
  const parsed = parsePandaMeshGeometry(initialPandaFieldValues)
  if (parsed.request === null) {
    throw new Error('Expected the initial PANDA geometry to be valid.')
  }
  return { ...parsed.request, refinement_level: refinementLevel }
}

function meshResult(configuration: PandaMeshRequest): PandaMeshResult {
  const nodes = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as [number, number][]
  const elements = [
    [0, 1, 2],
    [0, 2, 3],
    [1, 3, 2],
    [0, 3, 1],
  ] as [number, number, number][]
  return {
    configuration,
    nodes_m: nodes,
    node_count: nodes.length,
    elements,
    element_count: elements.length,
    region_tags: ['cladding', 'core', 'sap_1', 'sap_2'],
    region_summaries: [
      {
        region: 'cladding',
        element_count: 1,
        target_area_m2: 1,
        total_area_m2: 1,
      },
      { region: 'core', element_count: 1, target_area_m2: 1, total_area_m2: 1 },
      {
        region: 'sap_1',
        element_count: 1,
        target_area_m2: 1,
        total_area_m2: 1,
      },
      {
        region: 'sap_2',
        element_count: 1,
        target_area_m2: 1,
        total_area_m2: 1,
      },
    ],
    quality: {
      minimum_angle_deg: 30,
      minimum_normalized_quality: 0.5,
      mean_normalized_quality: 0.8,
    },
    warnings: [
      {
        code: 'polygonal_interface_approximation',
        message: 'Interfaces are polygonal.',
      },
    ],
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
      assumptions: ['polygonal interfaces'],
      limitations: ['mesh only'],
    },
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePandaMesh', () => {
  test('does not request while inactive', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      usePandaMesh(false, initialPandaFieldValues, 0),
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('idle')
    expect(result.current.result).toBeNull()
  })

  test('requests the initial mesh while active', async () => {
    const request = meshRequest(0)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(meshResult(request)))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      usePandaMesh(true, initialPandaFieldValues, 0),
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.phase).toBe('ready'))

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/photoelastic/panda/mesh')
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual(
      request,
    )
    expect(result.current.result).toEqual(meshResult(request))
  })

  test('requests a new mesh when refinement changes', async () => {
    const initialRequest = meshRequest(0)
    const refinedRequest = meshRequest(2)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(meshResult(initialRequest)))
      .mockResolvedValueOnce(jsonResponse(meshResult(refinedRequest)))
    vi.stubGlobal('fetch', fetchMock)

    const initialProps: HookProps = {
      active: true,
      values: initialPandaFieldValues,
      refinementLevel: 0,
    }
    const { result, rerender } = renderHook(
      ({ active, values, refinementLevel }: HookProps) =>
        usePandaMesh(active, values, refinementLevel),
      { initialProps },
    )

    await waitFor(() => expect(result.current.phase).toBe('ready'))
    rerender({ ...initialProps, refinementLevel: 2 })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.phase).toBe('ready'))

    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual(
      refinedRequest,
    )
    expect(result.current.result?.configuration.refinement_level).toBe(2)
  })

  test('exposes validation and does not request invalid geometry', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const invalidValues: PandaFieldFormValues = {
      ...initialPandaFieldValues,
      sap1CenterXUm: '0',
    }

    const { result } = renderHook(() => usePandaMesh(true, invalidValues, 0))

    expect(result.current.phase).toBe('validation')
    expect(result.current.errorMessage).toBe(
      'Check the highlighted PANDA geometry values.',
    )
    expect(result.current.fieldErrors.sap1CenterXUm).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test.each([
    ['malformed response', {}],
    ['mismatched response', meshResult(meshRequest(1))],
  ])('rejects a %s and supports retry', async (_label, invalidBody) => {
    const request = meshRequest(0)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(invalidBody))
      .mockResolvedValueOnce(jsonResponse(meshResult(request)))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      usePandaMesh(true, initialPandaFieldValues, 0),
    )

    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.result).toBeNull()
    expect(result.current.errorMessage).toBe(
      'PANDA mesh service returned a malformed response.',
    )

    act(() => result.current.onRetry())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.phase).toBe('ready'))

    expect(result.current.result?.configuration).toEqual(request)
  })

  test('aborts a stale request and ignores its later response', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    let firstSignal: AbortSignal | undefined
    const fetchMock = vi
      .fn()
      .mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
        if (fetchMock.mock.calls.length === 1) {
          firstSignal = init?.signal ?? undefined
          return first.promise
        }
        return second.promise
      })
    vi.stubGlobal('fetch', fetchMock)

    const initialProps: HookProps = {
      active: true,
      values: initialPandaFieldValues,
      refinementLevel: 0,
    }
    const { result, rerender } = renderHook(
      ({ active, values, refinementLevel }: HookProps) =>
        usePandaMesh(active, values, refinementLevel),
      { initialProps },
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender({ ...initialProps, refinementLevel: 1 })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)

    await act(async () => {
      second.resolve(jsonResponse(meshResult(meshRequest(1))))
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.phase).toBe('ready'))

    await act(async () => {
      first.resolve(jsonResponse(meshResult(meshRequest(0))))
      await Promise.resolve()
    })

    expect(result.current.result?.configuration.refinement_level).toBe(1)
  })
})
