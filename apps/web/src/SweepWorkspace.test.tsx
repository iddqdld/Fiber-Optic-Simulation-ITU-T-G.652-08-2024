import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  type SweepBaseConfiguration,
  type SweepRequest,
  type SweepResult,
} from './sweep'
import { SweepWorkspace } from './SweepWorkspace'

const baseConfiguration = {
  preset: 'custom',
  fibre: {
    n_core: 1.47,
    n_cladding: 1.465,
    core_radius_um: 4.1,
    mode_field_radius_um: 4.82,
    attenuation_db_per_km: 0.2,
    dispersion_ps_per_nm_km: 17,
    group_index_dimensionless: 1.468,
    cable_application: 'standard_cable',
  },
  source: {
    wavelength_nm: 1550,
    input_power_dbm: -3,
    spectral_width_fwhm_nm: 0.2,
    input_pulse_fwhm_ps: 25,
  },
  section: { length_km: 12.5 },
  sampling: { grid_half_width_um: 15, grid_points: 65 },
} satisfies SweepBaseConfiguration

const sweepRequest = {
  base_configuration: baseConfiguration,
  parameter: 'length_km',
  start_value: 12.5,
  stop_value: 20,
  sample_count: 3,
} satisfies SweepRequest

function makePoint(
  parameterValue: number,
  index: number,
  outputPower = -5 - index,
): SweepResult['points'][number] {
  return {
    approximate_mode_count: index === 0 ? null : 2 + index,
    attenuation_standard_status: index === 0 ? null : 'not_applicable',
    dispersion_broadening_fwhm_ps: 3 + index,
    dispersion_standard_status: index === 0 ? null : 'pass',
    group_delay_ps: 60 + index,
    mode_regime: index % 2 === 0 ? 'single_mode' : 'multimode',
    numerical_aperture_dimensionless: 0.12 + index / 100,
    output_power_dbm: outputPower,
    output_pulse_fwhm_ps: 25 + index,
    parameter_value: parameterValue,
    section_loss_db: 2 + index,
    v_number_dimensionless: 2 + index,
    warning_codes: index === 1 ? ['mode_count_unavailable'] : [],
  }
}

function makeResult(
  request: SweepRequest = sweepRequest,
  constantOutput = false,
): SweepResult {
  const interval =
    (request.stop_value - request.start_value) / (request.sample_count - 1)
  const points = Array.from({ length: request.sample_count }, (_, index) =>
    makePoint(
      index === request.sample_count - 1
        ? request.stop_value
        : request.start_value + interval * index,
      index,
      constantOutput ? -5 : undefined,
    ),
  )

  return {
    model_manifest: {
      assumptions: ['independent deterministic evaluations'],
      component_model_id: 'level1_single_section_simulation',
      limitations: ['no interpolation'],
      max_sample_count: 200,
      model_id: 'level1_one_parameter_sweep',
      model_version: '1.0.0',
      spacing: 'linear',
    },
    parameter_unit: 'km',
    points,
    request,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderWorkspace(
  configuration: SweepBaseConfiguration | null = baseConfiguration,
) {
  return render(<SweepWorkspace baseConfiguration={configuration} />)
}

function setThreePointRange() {
  fireEvent.change(screen.getByRole('spinbutton', { name: /Stop/ }), {
    target: { value: '20' },
  })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Sample count' }), {
    target: { value: '3' },
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('SweepWorkspace', () => {
  test('shows a disabled unavailable state without a configuration', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderWorkspace(null)

    expect(
      screen.getByRole('heading', { name: 'One-parameter sweep' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run sweep' })).toBeDisabled()
    expect(
      screen.getByRole('combobox', { name: 'Sweep parameter' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('heading', { name: 'Sweep unavailable' }),
    ).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('uses current defaults and resets the range on parameter change', () => {
    renderWorkspace()

    expect(
      screen.getByRole('combobox', { name: 'Sweep parameter' }),
    ).toHaveValue('length_km')
    expect(screen.getByRole('combobox', { name: 'Output metric' })).toHaveValue(
      'output-power',
    )
    expect(screen.getByRole('spinbutton', { name: /Start/ })).toHaveValue(12.5)
    expect(screen.getByRole('spinbutton', { name: /Stop/ })).toHaveValue(null)
    expect(
      screen.getByRole('spinbutton', { name: 'Sample count' }),
    ).toHaveValue(21)
    expect(screen.getByText('12.5 km')).toBeVisible()

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Sweep parameter' }),
      { target: { value: 'n_core' } },
    )

    expect(screen.getByRole('spinbutton', { name: /Start/ })).toHaveValue(1.47)
    expect(screen.getByRole('spinbutton', { name: /Stop/ })).toHaveValue(null)
    expect(screen.getByText('1.47 dimensionless')).toBeVisible()
  })

  test('reports local range errors without making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'start and stop values must be finite',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('posts the exact request and renders exact backend samples', async () => {
    const result = makeResult()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(result))
    vi.stubGlobal('fetch', fetchMock)
    renderWorkspace()
    setThreePointRange()

    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/simulations/sweep',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sweepRequest),
      }),
    )

    const chart = await screen.findByRole('img', {
      name: 'One-parameter sweep result',
    })
    expect(chart.querySelectorAll('[data-sweep-point="true"]')).toHaveLength(3)
    expect(
      chart.querySelector('[data-parameter-value="12.5"]'),
    ).toHaveAttribute('data-metric-value', '-5')
    expect(chart.querySelector('desc')).toHaveTextContent(
      /no interpolation, resampling, or frontend physics/i,
    )
    expect(screen.getByText('level1_one_parameter_sweep')).toBeVisible()

    fireEvent.click(
      screen.getByText('Exact sweep samples', { selector: 'summary' }),
    )
    const table = screen.getByRole('table', { name: 'Exact sweep samples' })
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(
      within(table).getByRole('columnheader', { name: /Output power/ }),
    ).toBeInTheDocument()
    expect(
      within(table).getAllByRole('cell', { name: 'Not evaluated' }),
    ).toHaveLength(2)
    expect(within(table).getAllByRole('cell', { name: 'None' })).toHaveLength(2)
  })

  test('shows pending state while a request is unresolved', async () => {
    let resolveResponse!: (response: Response) => void
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(responsePromise))
    renderWorkspace()
    setThreePointRange()

    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }))

    expect(await screen.findByText('Running sweep…')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Run sweep' })).toHaveAttribute(
      'aria-busy',
      'true',
    )

    resolveResponse(jsonResponse(makeResult()))
    await waitFor(() =>
      expect(screen.getByText('Sweep complete')).toBeVisible(),
    )
  })

  test('uses the structured API message for a rejected request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: { message: 'Structured sweep failure.', details: {} } },
            422,
          ),
        ),
    )
    renderWorkspace()
    setThreePointRange()

    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Structured sweep failure.',
    )
  })

  test('rejects a malformed successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ points: [] })),
    )
    renderWorkspace()
    setThreePointRange()

    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The sweep service returned an invalid result.',
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  test('does not render an aborted stale run when a second run wins', async () => {
    let resolveFirst!: (response: Response) => void
    let resolveSecond!: (response: Response) => void
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<Response>((resolve) => {
      resolveSecond = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    vi.stubGlobal('fetch', fetchMock)
    renderWorkspace()
    setThreePointRange()

    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstSignal = fetchMock.mock.calls[0][1]?.signal as AbortSignal
    expect(firstSignal.aborted).toBe(true)

    resolveFirst(jsonResponse(makeResult(sweepRequest, true)))
    await Promise.resolve()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    resolveSecond(jsonResponse(makeResult()))
    expect(
      await screen.findByRole('img', { name: 'One-parameter sweep result' }),
    ).toBeVisible()
  })

  test('reuses results for metric changes and clears them for range changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeResult()))
    vi.stubGlobal('fetch', fetchMock)
    renderWorkspace()
    setThreePointRange()
    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }))
    await screen.findByRole('img', { name: 'One-parameter sweep result' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Output metric' }), {
      target: { value: 'group-delay' },
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(screen.getByRole('img')).toBeVisible()
    expect(
      screen.getByRole('img').querySelector('[data-metric-id="group-delay"]'),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByRole('spinbutton', { name: /Start/ }), {
      target: { value: '13' },
    })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText('Sweep complete')).not.toBeInTheDocument()
  })

  test('pads a zero-span metric without invalid chart coordinates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(makeResult(sweepRequest, true))),
    )
    renderWorkspace()
    setThreePointRange()
    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }))

    const chart = await screen.findByRole('img', {
      name: 'One-parameter sweep result',
    })
    const point = chart.querySelector('.sweep-point')
    expect(point?.getAttribute('cx')).not.toContain('NaN')
    expect(point?.getAttribute('cy')).not.toContain('NaN')
  })

  test('exposes accessible controls and boundary guidance', () => {
    renderWorkspace()

    expect(screen.getByLabelText('Sweep parameter')).toBeInTheDocument()
    expect(screen.getByLabelText('Output metric')).toBeInTheDocument()
    expect(screen.getByLabelText(/Start/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Stop/)).toBeInTheDocument()
    expect(screen.getByLabelText('Sample count')).toBeInTheDocument()
    expect(screen.getByText(/Inspector boundary guidance/i)).toBeVisible()
  })
})
