import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { operations } from '../../../packages/shared_schemas/generated/api'
import App from './App'

type FetchOutcome = Response | Promise<Response> | Error
type GuidanceResult =
  operations['calculate_guidance']['responses'][200]['content']['application/json']

const guidanceResult = {
  critical_angle_deg: 84.78590277783555,
  numerical_aperture_dimensionless: 0.1317725312802331,
  air_acceptance_angle_deg: 7.572032141901169,
  relative_index_difference_dimensionless: 0.004137931034482762,
  v_number_dimensionless: 2.190064550298241,
  mode_regime: 'single_mode',
  approximate_mode_count: null,
  warnings: [
    {
      code: 'mode_count_unavailable',
      message:
        'V^2/2 estimate requires V >= 10.0 under the project validity policy (clearly highly multimode regime).',
      output_field: 'approximate_mode_count',
    },
  ],
  model_manifest: {
    model_id: 'ideal_circular_step_index_guidance',
    model_version: '1.0.0',
    mode_regime_cutoff_v_dimensionless: 2.405,
    mode_count_min_v_dimensionless: 10,
    assumptions: [
      'ideal circular step-index profile',
      'scalar weak-guidance mode interpretation',
      'homogeneous, isotropic, linear media',
      'n_external=1 for air angle',
    ],
    limitations: [
      'asymptotic mode count only at V >= 10.0 project threshold',
      'V=2.405 ideal cutoff distinct from measured cable cutoff',
      'not a G.652.D conformance model',
    ],
  },
} satisfies GuidanceResult

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function healthResponse(available = true): Response {
  return jsonResponse(
    { status: available ? 'ok' : 'unavailable' },
    available ? 200 : 503,
  )
}

function mockFetchWithHealth(
  guidanceResponses: FetchOutcome[] = [],
  health: FetchOutcome = healthResponse(),
) {
  const fetchMock = vi.fn<typeof fetch>()

  fetchMock.mockImplementationOnce(async (input) => {
    expect(input).toBe('/api/v1/health')
    if (health instanceof Error) {
      throw health
    }
    return health
  })

  guidanceResponses.forEach((response) => {
    fetchMock.mockImplementationOnce(async (input) => {
      expect(input).toBe('/api/v1/guidance/calculate')
      if (response instanceof Error) {
        throw response
      }
      return response
    })
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function calculatorCard() {
  return screen.getByRole('region', { name: 'Guidance calculator' })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('App backend status', () => {
  test('successful mocked fetch shows "Backend available"', async () => {
    const fetchMock = mockFetchWithHealth()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Backend available')
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('rejected fetch shows "Backend unavailable"', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network failure'))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Backend unavailable',
      )
    })
  })

  test('a non-OK health response shows "Backend unavailable"', async () => {
    mockFetchWithHealth([], healthResponse(false))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Backend unavailable',
      )
    })
  })
})

describe('Guidance calculator form', () => {
  test('renders one titled form with four required spinbuttons and neutral defaults', () => {
    mockFetchWithHealth()

    render(<App />)

    const card = calculatorCard()
    expect(
      screen.getAllByRole('region', { name: 'Guidance calculator' }),
    ).toHaveLength(1)
    expect(card.querySelector('form')).toBeInTheDocument()
    expect(
      within(card).getByRole('heading', { name: 'Guidance calculator' }),
    ).toBeVisible()

    const fields = [
      ['Core refractive index', 1.45],
      ['Cladding refractive index', 1.444],
      ['Core radius (µm)', 4.1],
      ['Wavelength (nm)', 1550],
    ] as const

    expect(screen.getAllByRole('spinbutton')).toHaveLength(fields.length)
    fields.forEach(([name, value]) => {
      const input = within(card).getByRole('spinbutton', { name })
      expect(input).toBeRequired()
      expect(input).toHaveAttribute('step', 'any')
      expect(input).toHaveValue(value)
    })

    for (const [name] of fields) {
      const input = within(card).getByRole('spinbutton', { name })
      expect(Number(input.getAttribute('min'))).toBeGreaterThan(0)
    }
  })

  test('posts the exact numeric guidance payload with POST and JSON headers', async () => {
    const response = jsonResponse(guidanceResult)
    const fetchMock = mockFetchWithHealth([response])

    render(<App />)

    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Core refractive index' }),
      { target: { value: '1.51' } },
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Cladding refractive index' }),
      { target: { value: '1.49' } },
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Core radius (µm)' }),
      { target: { value: '5.2' } },
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Wavelength (nm)' }),
      { target: { value: '1310' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Calculate guidance' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    const [, requestInit] = fetchMock.mock.calls[1]
    expect(requestInit?.method).toBe('POST')
    expect(new Headers(requestInit?.headers).get('Content-Type')).toBe(
      'application/json',
    )
    const payload = JSON.parse(String(requestInit?.body)) as Record<
      string,
      number
    >
    expect(Object.keys(payload).sort()).toEqual([
      'core_radius_um',
      'n_cladding',
      'n_core',
      'wavelength_nm',
    ])
    expect(payload).toEqual({
      n_core: 1.51,
      n_cladding: 1.49,
      core_radius_um: 5.2,
      wavelength_nm: 1310,
    })
  })

  test('disables the submit button and shows the pending label while calculating', async () => {
    const calculation = deferred<Response>()
    mockFetchWithHealth([calculation.promise])

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Calculate guidance' }))

    const pendingButton = await screen.findByRole('button', {
      name: 'Calculating…',
    })
    expect(pendingButton).toBeDisabled()

    calculation.resolve(jsonResponse(guidanceResult))
    await screen.findByRole('region', {
      name: 'Guidance results',
    })
  })
})

describe('Guidance calculator results', () => {
  test('renders scientific outputs, the approximate model label, and warning messages', async () => {
    mockFetchWithHealth([jsonResponse(guidanceResult)])

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Calculate guidance' }))

    const results = await screen.findByRole('region', {
      name: 'Guidance results',
    })

    const outputLabels = [
      /^Critical angle(?: \(°\))?$/,
      'Numerical aperture',
      /^Air acceptance angle(?: \(°\))?$/,
      'Relative index difference',
      'V-number',
      'Mode regime',
      'Approximate mode count',
    ]
    outputLabels.forEach((label) => {
      expect(within(results).getByText(label, { exact: true })).toBeVisible()
    })
    for (const value of [
      guidanceResult.critical_angle_deg,
      guidanceResult.numerical_aperture_dimensionless,
      guidanceResult.air_acceptance_angle_deg,
      guidanceResult.relative_index_difference_dimensionless,
      guidanceResult.v_number_dimensionless,
    ]) {
      expect(within(results).getByText(String(value))).toBeVisible()
    }
    expect(within(results).getByText('Single mode')).toBeVisible()
    expect(within(results).getByText('Unavailable')).toBeVisible()
    expect(
      within(results).getByText('Approximate model', { exact: true }),
    ).toBeVisible()
    expect(
      within(results).getByText(guidanceResult.warnings[0].message),
    ).toBeVisible()
  })

  test('renders nullable air angle and mode count as "Unavailable"', async () => {
    const resultWithUnavailableOutputs = {
      ...guidanceResult,
      air_acceptance_angle_deg: null,
      approximate_mode_count: null,
    }
    mockFetchWithHealth([jsonResponse(resultWithUnavailableOutputs)])

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Calculate guidance' }))

    await screen.findByRole('heading', { name: 'Guidance results' })
    expect(screen.getAllByText('Unavailable', { exact: true })).toHaveLength(2)
  })
})

describe('Guidance calculator errors', () => {
  test('shows the message from a structured non-OK ErrorResponse in an alert', async () => {
    const message =
      'Core refractive index must exceed cladding refractive index.'
    const response = jsonResponse(
      {
        error: {
          code: 'REQUEST_VALIDATION_ERROR',
          message,
          field: null,
          details: {},
          trace_id: 'test-trace-id',
        },
      },
      422,
    )
    mockFetchWithHealth([response])

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Calculate guidance' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  test('shows a generic alert for a malformed non-JSON non-OK response', async () => {
    mockFetchWithHealth([
      new Response('upstream failure', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      }),
    ])

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Calculate guidance' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /^Calculation failed\.$/,
    )
  })

  test('shows a service-reachability alert when calculation fetch is rejected', async () => {
    mockFetchWithHealth([new Error('network failure')])

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Calculate guidance' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to reach the calculation service.',
    )
  })

  test('clears a stale result when a later request starts', async () => {
    const secondCalculation = deferred<Response>()
    const firstResult = {
      ...guidanceResult,
      warnings: [
        {
          code: 'mode_count_unavailable',
          message: 'Old result warning',
          output_field: 'approximate_mode_count',
        },
      ],
    }
    mockFetchWithHealth([jsonResponse(firstResult), secondCalculation.promise])

    render(<App />)
    const button = screen.getByRole('button', { name: 'Calculate guidance' })
    fireEvent.click(button)
    await screen.findByRole('heading', { name: 'Guidance results' })
    expect(screen.getByText('Old result warning')).toBeVisible()

    fireEvent.click(button)
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Guidance results' }),
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Old result warning')).not.toBeInTheDocument()
    })

    secondCalculation.resolve(jsonResponse(guidanceResult))
    await screen.findByRole('heading', { name: 'Guidance results' })
  })

  test('clears a stale error when a later request starts', async () => {
    const secondCalculation = deferred<Response>()
    mockFetchWithHealth([
      new Response('upstream failure', { status: 500 }),
      secondCalculation.promise,
    ])

    render(<App />)
    const button = screen.getByRole('button', { name: 'Calculate guidance' })
    fireEvent.click(button)
    await screen.findByRole('alert')

    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    secondCalculation.resolve(jsonResponse(guidanceResult))
    await screen.findByRole('heading', { name: 'Guidance results' })
  })
})
