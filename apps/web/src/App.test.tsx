import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type {
  components,
  operations,
} from '../../../packages/shared_schemas/generated/api'
import App from './App'
import type { ModeProfileData } from './FibreGeometryView'

type GeometryProps = {
  coreRadiusUm: number | null
  sectionLengthKm: number | null
  rayGuidance: {
    criticalAngleDeg: number
    modelId: string
    modelVersion: string
  } | null
  modeProfile: ModeProfileData | null
}

vi.mock('./FibreGeometryView', () => ({
  FibreGeometryView: ({
    coreRadiusUm,
    sectionLengthKm,
    rayGuidance,
    modeProfile,
  }: GeometryProps) => (
    <section role="region" aria-label="3D fibre geometry">
      <p>
        Core radius: {coreRadiusUm === null ? 'null' : `${coreRadiusUm} µm`}
      </p>
      <p>
        Section length:{' '}
        {sectionLengthKm === null ? 'null' : `${sectionLengthKm} km`}
      </p>
      <p aria-label="Ray guidance" data-testid="ray-guidance">
        {rayGuidance === null
          ? 'null'
          : `${rayGuidance.criticalAngleDeg}° · ${rayGuidance.modelId} · ${rayGuidance.modelVersion}`}
      </p>
      <p aria-label="Mode profile" data-testid="mode-profile">
        {modeProfile === null
          ? 'null'
          : `Grid: ${modeProfile.gridPoints} x ${modeProfile.gridPoints} · Extent: x ${modeProfile.xUm[0]}..${modeProfile.xUm.at(-1)} µm, y ${modeProfile.yUm[0]}..${modeProfile.yUm.at(-1)} µm · Center intensity: ${modeProfile.normalizedIntensity[(modeProfile.gridPoints - 1) / 2][(modeProfile.gridPoints - 1) / 2]} · Radius: ${modeProfile.modeFieldRadiusUm} µm · Model: ${modeProfile.modelId} ${modeProfile.modelVersion} · Normalization: ${modeProfile.normalizationConvention} · Radius convention: ${modeProfile.radiusConvention}`}
      </p>
    </section>
  ),
}))

type Level1Request =
  operations['preview_level1_simulation']['requestBody']['content']['application/json']
type Level1Result =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']
type FetchOutcome = Response | Promise<Response> | Error

const initialConfiguration = {
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
} satisfies Level1Request

const simulationManifest = {
  model_id: 'level1_single_section_simulation',
  model_version: '1.0.0',
  component_model_ids: [
    'ideal_circular_step_index_guidance',
    'gaussian_lp01_mode_profile',
    'constant_fibre_attenuation',
    'constant_group_index_delay',
    'first_order_chromatic_pulse_broadening',
  ],
  assumptions: [
    'one uniform fibre section',
    'all calculations share one operating wavelength',
    'fibre composition is uniform over the section',
  ],
  limitations: [
    'excludes bends, splices, and connectors',
    'excludes polarization-mode dispersion',
    'excludes optical nonlinearity',
    'excludes multi-section links',
    'excludes full-wave field solving',
  ],
} satisfies Level1Result['model_manifest']

const guidanceManifest = {
  model_id: 'ideal_circular_step_index_guidance',
  model_version: '1.0.0',
  mode_regime_cutoff_v_dimensionless: 2.405,
  mode_count_min_v_dimensionless: 10,
  assumptions: ['ideal circular step-index profile'],
  limitations: ['not a G.652.D conformance model'],
} satisfies components['schemas']['GuidanceModelManifest']

const attenuationManifest = {
  model_id: 'constant_fibre_attenuation',
  model_version: '1.0.0',
  assumptions: ['uniform attenuation coefficient over the fibre section'],
  limitations: ['not a G.652 conformance or typical-value model'],
} satisfies components['schemas']['ConstantAttenuationManifest']

const groupDelayManifest = {
  model_id: 'constant_group_index_delay',
  model_version: '1.0.0',
  vacuum_speed_m_per_s: 299792458,
  assumptions: ['constant supplied group index over the fibre section'],
  limitations: ['group index is supplied rather than derived'],
} satisfies components['schemas']['GroupDelayManifest']

const pulseManifest = {
  model_id: 'first_order_chromatic_pulse_broadening',
  model_version: '1.0.0',
  width_convention: 'fwhm',
  assumptions: [
    'Gaussian input pulse and Gaussian source spectrum use FWHM widths',
  ],
  limitations: [
    'first-order delay-spread approximation rather than full pulse propagation',
  ],
} satisfies components['schemas']['ChromaticPulseBroadeningManifest']

const modeProfileManifest = {
  model_id: 'gaussian_lp01_mode_profile',
  model_version: '1.0.0',
  normalization_convention: 'unit_peak_field_and_intensity',
  radius_convention: '1/e_field_radius',
  assumptions: ['scalar, circularly symmetric Gaussian LP01 approximation'],
  limitations: ['not an exact step-index eigenmode solver'],
} satisfies components['schemas']['GaussianModeProfileManifest']

function buildModeProfile({
  gridHalfWidthUm = 15,
  gridPoints = 65,
  modeFieldRadiusUm = 4.82,
}: {
  gridHalfWidthUm?: number
  gridPoints?: number
  modeFieldRadiusUm?: number
} = {}) {
  const axis = Array.from(
    { length: gridPoints },
    (_, index) =>
      -gridHalfWidthUm + (2 * gridHalfWidthUm * index) / (gridPoints - 1),
  )
  const normalizedField = axis.map((yUm) =>
    axis.map((xUm) =>
      Math.exp(-((xUm ** 2 + yUm ** 2) / modeFieldRadiusUm ** 2)),
    ),
  )
  const normalizedIntensity = normalizedField.map((row) =>
    row.map((field) => field ** 2),
  )

  return {
    grid_half_width_um: gridHalfWidthUm,
    grid_points: gridPoints,
    mode_field_radius_um: modeFieldRadiusUm,
    normalized_field: normalizedField,
    normalized_intensity: normalizedIntensity,
    x_um: axis,
    y_um: axis,
    model_manifest: modeProfileManifest,
  } satisfies Level1Result['mode_profile']
}

const customResult = {
  configuration: initialConfiguration,
  guidance: {
    critical_angle_deg: 85.27298324998428,
    numerical_aperture_dimensionless: 0.12114041439585586,
    air_acceptance_angle_deg: 6.957923692892281,
    relative_index_difference_dimensionless: 0.0034,
    v_number_dimensionless: 2.0133583577642065,
    mode_regime: 'single_mode',
    approximate_mode_count: null,
    warnings: [
      {
        code: 'mode_count_unavailable',
        message:
          'Mode count estimate is unavailable below the validity threshold.',
        output_field: 'approximate_mode_count',
      },
    ],
    model_manifest: guidanceManifest,
  },
  attenuation: {
    attenuation_db_per_km: 0.2,
    input_power_dbm: -3,
    length_km: 12.5,
    section_loss_db: 2.5,
    output_power_dbm: -5.5,
    model_manifest: attenuationManifest,
  },
  group_delay: {
    group_delay_ps: 61209011.468860894,
    group_index_dimensionless: 1.468,
    length_km: 12.5,
    model_manifest: groupDelayManifest,
  },
  pulse_broadening: {
    accumulated_dispersion_ps_per_nm: 212.5,
    dispersion_broadening_fwhm_ps: 42.5,
    dispersion_ps_per_nm_km: 17,
    input_pulse_fwhm_ps: 25,
    length_km: 12.5,
    output_pulse_fwhm_ps: 49.30770730829005,
    spectral_width_fwhm_nm: 0.2,
    model_manifest: pulseManifest,
  },
  mode_profile: buildModeProfile(),
  model_manifest: simulationManifest,
  standards_checks: {
    preset: 'custom',
    preset_definition: null,
    dispersion: null,
    attenuation: null,
  },
  warnings: [
    {
      code: 'mode_count_unavailable',
      message:
        'Mode count estimate is unavailable below the validity threshold.',
      output_field: 'guidance.approximate_mode_count',
      source_model_id: 'ideal_circular_step_index_guidance',
    },
  ],
} satisfies Level1Result

const g652dPreset = {
  model_id: 'itu_t_g652d_preset',
  model_version: '1.0.0',
  preset_id: 'g652d_2024',
  fibre_category: 'G.652.D',
  standard_name: 'ITU-T G.652',
  standard_edition: '08/2024',
  assumptions: ['Table 2 and Appendix I values are represented separately'],
  limitations: [
    'the preset is not a complete G.652.D conformance determination',
  ],
  source_references: ['ITU-T G.652 (08/2024), Table 2'],
} satisfies components['schemas']['G652DPreset']

const dispersionCheckManifest = {
  model_id: 'itu_t_g652d_chromatic_dispersion_check',
  model_version: '1.0.0',
  envelope_model_id: 'itu_t_g652d_chromatic_dispersion_envelope',
  envelope_model_version: '1.0.0',
  fibre_category: 'G.652.D',
  standard_name: 'ITU-T G.652',
  standard_edition: '08/2024',
  comparison_rule: 'inclusive_envelope',
  assumptions: ['values equal to either published envelope boundary pass'],
  limitations: [
    'a passing dispersion check is not complete G.652.D conformance',
  ],
} satisfies components['schemas']['G652DDispersionCheckManifest']

const attenuationCheckManifest = {
  model_id: 'itu_t_g652d_attenuation_check',
  model_version: '1.0.0',
  fibre_category: 'G.652.D',
  standard_name: 'ITU-T G.652',
  standard_edition: '08/2024',
  comparison_rule: 'inclusive_maximum',
  assumptions: ['values are compared at the supplied wavelength'],
  limitations: ['a passing attenuation result is not full G.652.D conformance'],
} satisfies components['schemas']['G652DAttenuationCheckManifest']

const g652dStandardsChecks = {
  preset: 'g652d',
  preset_definition: g652dPreset,
  dispersion: {
    fit_region: 'linear',
    margin_above_minimum_ps_per_nm_km: 8,
    margin_below_maximum_ps_per_nm_km: 1,
    maximum_dispersion_ps_per_nm_km: 18,
    minimum_dispersion_ps_per_nm_km: 8,
    supplied_dispersion_ps_per_nm_km: 17,
    wavelength_nm: 1550,
    status: 'pass',
    model_manifest: dispersionCheckManifest,
  },
  attenuation: {
    cable_application: 'standard_cable',
    limit_band: 'c_band_1530_1565',
    margin_below_maximum_db_per_km: 0.025,
    maximum_attenuation_db_per_km: 0.3,
    not_applicable_reason: null,
    supplied_attenuation_db_per_km: 0.275,
    wavelength_nm: 1550,
    status: 'pass',
    model_manifest: attenuationCheckManifest,
  },
} satisfies Level1Result['standards_checks']

const g652dResult = {
  ...customResult,
  configuration: {
    ...initialConfiguration,
    preset: 'g652d',
    fibre: {
      ...initialConfiguration.fibre,
      attenuation_db_per_km: 0.275,
      dispersion_ps_per_nm_km: 17,
    },
    source: { ...initialConfiguration.source, wavelength_nm: 1550 },
  },
  attenuation: { ...customResult.attenuation, attenuation_db_per_km: 0.275 },
  standards_checks: g652dStandardsChecks,
} satisfies Level1Result

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function mockFetch(
  options: { health?: FetchOutcome; preview?: FetchOutcome[] } = {},
) {
  let previewIndex = 0
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url === '/api/v1/health' && method === 'GET') {
        const outcome = options.health ?? jsonResponse({ status: 'ok' })
        if (outcome instanceof Error) {
          throw outcome
        }
        return outcome
      }

      if (url === '/api/v1/simulations/preview' && method === 'POST') {
        const outcome =
          options.preview?.[previewIndex] ?? jsonResponse(customResult)
        previewIndex += 1
        if (outcome instanceof Error) {
          throw outcome
        }
        return outcome
      }

      throw new Error(`Unexpected ${method} ${url}`)
    })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function previewCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.filter(
    ([input, init]) =>
      String(input) === '/api/v1/simulations/preview' &&
      (init?.method ?? 'GET') === 'POST',
  )
}

function previewPayload(fetchMock: ReturnType<typeof mockFetch>) {
  const calls = previewCalls(fetchMock)
  const lastCall = calls.at(-1)
  if (!lastCall) {
    throw new Error('Expected a preview request')
  }

  return JSON.parse(String(lastCall[1]?.body)) as Level1Request
}

async function settleDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(250)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

function numberInput(name: RegExp) {
  return screen.getByRole('spinbutton', { name })
}

function modeProfileOutput() {
  return screen.getByTestId('mode-profile')
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('backend health', () => {
  test('reports an available backend from the health endpoint', async () => {
    const fetchMock = mockFetch()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Backend available')
    })
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === '/api/v1/health',
      ),
    ).toHaveLength(1)
  })

  test('reports an unavailable backend when health rejects', async () => {
    mockFetch({ health: new Error('network failure') })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Backend unavailable',
      )
    })
  })

  test('reports an unavailable backend for a non-OK health response', async () => {
    mockFetch({ health: jsonResponse({ status: 'unavailable' }, 503) })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Backend unavailable',
      )
    })
  })
})

describe('Level 1 form', () => {
  test('renders the complete accessible form with explicit units and defaults', () => {
    mockFetch()

    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Optical Fibre Simulator' }),
    ).toBeVisible()
    const configuration = screen.getByRole('region', {
      name: 'Level 1 configuration',
    })
    expect(
      within(configuration).getByRole('heading', {
        name: 'Level 1 configuration',
      }),
    ).toBeVisible()

    expect(
      within(configuration).getByRole('combobox', { name: 'Fibre preset' }),
    ).toHaveValue('custom')
    expect(
      within(configuration).getByRole('option', { name: 'Custom fibre' }),
    ).toBeInTheDocument()
    expect(
      within(configuration).getByRole('option', { name: 'ITU-T G.652.D' }),
    ).toBeInTheDocument()

    for (const groupName of ['Fibre', 'Source', 'Section', 'Sampling']) {
      expect(
        within(configuration).getByRole('group', { name: groupName }),
      ).toBeVisible()
    }

    const fields = [
      [/Core refractive index.*dimensionless/i, 1.47],
      [/Cladding refractive index.*dimensionless/i, 1.465],
      [/Core radius.*µm/i, 4.1],
      [/Mode.field radius.*µm/i, 4.82],
      [/Attenuation.*dB\/km/i, 0.2],
      [/Dispersion.*ps\/\(nm km\)/i, 17],
      [/Group index.*dimensionless/i, 1.468],
      [/Wavelength.*nm/i, 1550],
      [/Input power.*dBm/i, -3],
      [/Spectral width.*FWHM.*nm/i, 0.2],
      [/Input pulse.*FWHM.*ps/i, 25],
      [/length.*km/i, 12.5],
      [/Grid half.width.*µm/i, 15],
      [/Grid points/i, 65],
    ] as const

    expect(within(configuration).getAllByRole('spinbutton')).toHaveLength(
      fields.length,
    )
    fields.forEach(([name, value]) => {
      const input = within(configuration).getByRole('spinbutton', { name })
      expect(input).toBeRequired()
      expect(input).toHaveValue(value)
    })
    expect(
      within(configuration).getByRole('combobox', {
        name: 'Cable application',
      }),
    ).toHaveValue('standard_cable')
  })

  test('posts the exact nested initial payload after the 250 ms debounce', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch()

    render(<App />)
    await settleDebounce()

    expect(previewPayload(fetchMock)).toEqual(initialConfiguration)
    expect(previewCalls(fetchMock)).toHaveLength(1)
    const [, requestInit] = previewCalls(fetchMock)[0]
    expect(requestInit?.method).toBe('POST')
    expect(new Headers(requestInit?.headers).get('Content-Type')).toBe(
      'application/json',
    )
  })

  test('G.652.D changes only its three requested defaults', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch()

    render(<App />)
    await settleDebounce()

    fireEvent.change(numberInput(/Core refractive index/i), {
      target: { value: '1.48' },
    })
    fireEvent.change(numberInput(/Core radius/i), { target: { value: '4.4' } })
    fireEvent.change(numberInput(/Input power/i), { target: { value: '-2' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Fibre preset' }), {
      target: { value: 'g652d' },
    })

    expect(numberInput(/Core refractive index/i)).toHaveValue(1.48)
    expect(numberInput(/Core radius/i)).toHaveValue(4.4)
    expect(numberInput(/Input power/i)).toHaveValue(-2)
    expect(numberInput(/Wavelength/i)).toHaveValue(1550)
    expect(numberInput(/Attenuation/i)).toHaveValue(0.275)
    expect(numberInput(/Dispersion/i)).toHaveValue(17)

    await settleDebounce()
    expect(previewPayload(fetchMock)).toEqual({
      ...initialConfiguration,
      preset: 'g652d',
      fibre: {
        ...initialConfiguration.fibre,
        n_core: 1.48,
        core_radius_um: 4.4,
        attenuation_db_per_km: 0.275,
        dispersion_ps_per_nm_km: 17,
      },
      source: { ...initialConfiguration.source, input_power_dbm: -2 },
    })
  })

  test('switching back to custom preserves current values', () => {
    mockFetch()

    render(<App />)
    fireEvent.change(numberInput(/Core refractive index/i), {
      target: { value: '1.49' },
    })
    fireEvent.change(numberInput(/Mode.field radius/i), {
      target: { value: '5.1' },
    })
    fireEvent.change(numberInput(/length.*km/i), {
      target: { value: '20' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Fibre preset' }), {
      target: { value: 'g652d' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Fibre preset' }), {
      target: { value: 'custom' },
    })

    expect(screen.getByRole('combobox', { name: 'Fibre preset' })).toHaveValue(
      'custom',
    )
    expect(numberInput(/Core refractive index/i)).toHaveValue(1.49)
    expect(numberInput(/Mode.field radius/i)).toHaveValue(5.1)
    expect(numberInput(/length.*km/i)).toHaveValue(20)
    expect(numberInput(/Wavelength/i)).toHaveValue(1550)
    expect(numberInput(/Attenuation/i)).toHaveValue(0.275)
  })

  test('coalesces rapid valid edits into one preview request', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch()

    render(<App />)
    await settleDebounce()
    const initialCallCount = previewCalls(fetchMock).length

    fireEvent.change(numberInput(/Core radius/i), { target: { value: '4.2' } })
    fireEvent.change(numberInput(/Wavelength/i), { target: { value: '1310' } })
    fireEvent.change(numberInput(/length.*km/i), {
      target: { value: '13' },
    })

    await act(async () => {
      vi.advanceTimersByTime(249)
    })
    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount)

    await settleDebounce()
    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount + 1)
    expect(previewPayload(fetchMock)).toEqual({
      ...initialConfiguration,
      fibre: { ...initialConfiguration.fibre, core_radius_um: 4.2 },
      source: { ...initialConfiguration.source, wavelength_nm: 1310 },
      section: { length_km: 13 },
    })
  })

  test('does not preview locally invalid index, grid, or preset wavelength values', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch()

    render(<App />)
    await settleDebounce()
    const initialCallCount = previewCalls(fetchMock).length

    fireEvent.change(numberInput(/Core refractive index/i), {
      target: { value: '1.46' },
    })
    await settleDebounce()
    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount)

    fireEvent.change(numberInput(/Core refractive index/i), {
      target: { value: '1.47' },
    })
    fireEvent.change(numberInput(/Grid points/i), { target: { value: '64' } })
    await settleDebounce()
    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount)

    fireEvent.change(numberInput(/Grid points/i), { target: { value: '67' } })
    await settleDebounce()
    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount)

    fireEvent.change(numberInput(/Grid points/i), { target: { value: '65' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Fibre preset' }), {
      target: { value: 'g652d' },
    })
    fireEvent.change(numberInput(/Wavelength/i), { target: { value: '1200' } })
    await settleDebounce()
    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount)
  })

  test('previews the inclusive G.652.D wavelength boundaries only', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch()

    render(<App />)
    await settleDebounce()
    const initialCallCount = previewCalls(fetchMock).length

    fireEvent.change(screen.getByRole('combobox', { name: 'Fibre preset' }), {
      target: { value: 'g652d' },
    })
    await settleDebounce()
    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount + 1)

    const wavelength = numberInput(/Wavelength/i)
    fireEvent.change(wavelength, { target: { value: '1260' } })
    await settleDebounce()
    expect(previewPayload(fetchMock).source.wavelength_nm).toBe(1260)

    fireEvent.change(wavelength, { target: { value: '1259' } })
    await settleDebounce()
    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount + 2)

    fireEvent.change(wavelength, { target: { value: '1625' } })
    await settleDebounce()
    expect(previewPayload(fetchMock).source.wavelength_nm).toBe(1625)

    fireEvent.change(wavelength, { target: { value: '1626' } })
    await settleDebounce()
    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount + 3)
  })
})

describe('Fibre geometry integration', () => {
  test('receives immediate valid and null values without waiting for preview', () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch()

    render(<App />)

    const geometry = screen.getByRole('region', { name: '3D fibre geometry' })
    expect(previewCalls(fetchMock)).toHaveLength(0)
    expect(geometry).toHaveTextContent('Core radius: 4.1 µm')
    expect(geometry).toHaveTextContent('Section length: 12.5 km')

    fireEvent.change(numberInput(/Core radius/i), {
      target: { value: '4.6' },
    })
    fireEvent.change(numberInput(/length.*km/i), {
      target: { value: '0' },
    })
    expect(geometry).toHaveTextContent('Core radius: 4.6 µm')
    expect(geometry).toHaveTextContent('Section length: 0 km')

    fireEvent.change(numberInput(/Core radius/i), { target: { value: '' } })
    fireEvent.change(numberInput(/length.*km/i), {
      target: { value: '-1' },
    })
    expect(geometry).toHaveTextContent('Core radius: null')
    expect(geometry).toHaveTextContent('Section length: null')
  })

  test('does not schedule a preview for invalid geometry-only edits', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch()

    render(<App />)
    await settleDebounce()
    const initialCallCount = previewCalls(fetchMock).length

    fireEvent.change(numberInput(/Core radius/i), { target: { value: '0' } })
    fireEvent.change(numberInput(/length.*km/i), {
      target: { value: '-1' },
    })
    await settleDebounce()

    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount)
  })
})

describe('Level 1 preview state and results', () => {
  test('keeps ray guidance null until a validated preview is ready', async () => {
    vi.useFakeTimers()
    const first = deferred<Response>()
    mockFetch({ preview: [first.promise] })

    render(<App />)
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent('null')
    expect(modeProfileOutput()).toHaveTextContent('null')

    await settleDebounce()
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent('null')
    expect(modeProfileOutput()).toHaveTextContent('null')

    await act(async () => {
      first.resolve(jsonResponse(customResult))
      await Promise.resolve()
    })
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent(
      '85.27298324998428° · ideal_circular_step_index_guidance · 1.0.0',
    )
    expect(modeProfileOutput()).toHaveTextContent('Center intensity: 1')
  })

  test('propagates the validated 65-point mode profile in camelCase', async () => {
    vi.useFakeTimers()
    mockFetch({ preview: [jsonResponse(customResult)] })

    render(<App />)
    await settleDebounce()

    const modeProfile = customResult.mode_profile
    expect(modeProfile.grid_points).toBe(65)
    expect(modeProfile.x_um).toHaveLength(65)
    expect(modeProfile.y_um).toHaveLength(65)
    expect(modeProfile.x_um[0]).toBe(-15)
    expect(modeProfile.x_um[1]).toBe(-14.53125)
    expect(modeProfile.x_um[32]).toBe(0)
    expect(modeProfile.x_um[64]).toBe(15)
    expect(modeProfile.normalized_intensity[32][32]).toBe(1)
    expect(modeProfile.normalized_intensity[32][33]).toBeCloseTo(
      0.9812622474073953,
      15,
    )
    expect(modeProfile.normalized_intensity[0][0]).toBeCloseTo(
      1.4992187712298396e-17,
      16,
    )

    expect(modeProfileOutput()).toHaveTextContent('Grid: 65 x 65')
    expect(modeProfileOutput()).toHaveTextContent(
      'Extent: x -15..15 µm, y -15..15 µm',
    )
    expect(modeProfileOutput()).toHaveTextContent('Center intensity: 1')
    expect(modeProfileOutput()).toHaveTextContent('Radius: 4.82 µm')
    expect(modeProfileOutput()).toHaveTextContent(
      'Model: gaussian_lp01_mode_profile 1.0.0',
    )
    expect(modeProfileOutput()).toHaveTextContent(
      'Normalization: unit_peak_field_and_intensity',
    )
    expect(modeProfileOutput()).toHaveTextContent(
      'Radius convention: 1/e_field_radius',
    )
  })

  test('clears ray guidance immediately on edits and restores only the latest success', async () => {
    vi.useFakeTimers()
    const first = deferred<Response>()
    const second = deferred<Response>()
    mockFetch({ preview: [first.promise, second.promise] })

    render(<App />)
    await settleDebounce()
    await act(async () => {
      first.resolve(jsonResponse(customResult))
      await Promise.resolve()
    })
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent(
      '85.27298324998428°',
    )
    expect(modeProfileOutput()).toHaveTextContent('Radius: 4.82 µm')

    fireEvent.change(numberInput(/Core refractive index/i), {
      target: { value: '1.48' },
    })
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent('null')
    expect(modeProfileOutput()).toHaveTextContent('null')

    await settleDebounce()
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent('null')
    expect(modeProfileOutput()).toHaveTextContent('null')

    await act(async () => {
      second.resolve(
        jsonResponse({
          ...customResult,
          configuration: {
            ...customResult.configuration,
            fibre: { ...customResult.configuration.fibre, n_core: 1.48 },
          },
          guidance: {
            ...customResult.guidance,
            critical_angle_deg: 81.83568244780919,
          },
        }),
      )
      await Promise.resolve()
    })
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent(
      '81.83568244780919° · ideal_circular_step_index_guidance · 1.0.0',
    )
    expect(modeProfileOutput()).toHaveTextContent('Radius: 4.82 µm')
  })

  test('clears ray guidance for invalid edits without scheduling a request', async () => {
    vi.useFakeTimers()
    const first = deferred<Response>()
    const fetchMock = mockFetch({ preview: [first.promise] })

    render(<App />)
    await settleDebounce()
    await act(async () => {
      first.resolve(jsonResponse(customResult))
      await Promise.resolve()
    })
    const initialCallCount = previewCalls(fetchMock).length
    expect(modeProfileOutput()).toHaveTextContent('Center intensity: 1')

    fireEvent.change(numberInput(/Core radius/i), { target: { value: '0' } })
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent('null')
    expect(modeProfileOutput()).toHaveTextContent('null')

    await settleDebounce()
    expect(previewCalls(fetchMock)).toHaveLength(initialCallCount)
  })

  test('clears ray guidance on preview failure and malformed guidance', async () => {
    vi.useFakeTimers()
    const malformedGuidanceResult = {
      ...customResult,
      guidance: {
        ...customResult.guidance,
        critical_angle_deg: 90,
      },
    }
    const fetchMock = mockFetch({
      preview: [
        jsonResponse(customResult),
        jsonResponse(malformedGuidanceResult),
        jsonResponse(
          { error: { message: 'Preview service rejected the request.' } },
          500,
        ),
        new Error('network failure'),
      ],
    })

    render(<App />)
    await settleDebounce()
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent(
      '85.27298324998428°',
    )
    expect(modeProfileOutput()).toHaveTextContent('Center intensity: 1')

    fireEvent.change(numberInput(/Core radius/i), { target: { value: '4.2' } })
    await settleDebounce()
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent('null')
    expect(modeProfileOutput()).toHaveTextContent('null')
    expect(screen.getByRole('alert')).toHaveTextContent(/^Preview failed\.$/)

    fireEvent.change(numberInput(/Core radius/i), { target: { value: '4.3' } })
    await settleDebounce()
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent('null')
    expect(modeProfileOutput()).toHaveTextContent('null')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Preview service rejected the request.',
    )

    fireEvent.change(numberInput(/Core radius/i), { target: { value: '4.4' } })
    await settleDebounce()
    expect(screen.getByTestId('ray-guidance')).toHaveTextContent('null')
    expect(modeProfileOutput()).toHaveTextContent('null')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to reach the preview service.',
    )
    expect(previewCalls(fetchMock)).toHaveLength(4)
  })

  const malformedModeProfiles: Array<[string, unknown]> = [
    [
      'a short x axis',
      {
        ...customResult.mode_profile,
        x_um: customResult.mode_profile.x_um.slice(1),
      },
    ],
    [
      'a nonfinite y axis value',
      {
        ...customResult.mode_profile,
        y_um: customResult.mode_profile.y_um.map((value, index) =>
          index === 32 ? Number.NaN : value,
        ),
      },
    ],
    [
      'a malformed field grid',
      {
        ...customResult.mode_profile,
        normalized_field: customResult.mode_profile.normalized_field.map(
          (row, index) => (index === 32 ? row.slice(1) : row),
        ),
      },
    ],
    [
      'a malformed intensity grid',
      {
        ...customResult.mode_profile,
        normalized_intensity:
          customResult.mode_profile.normalized_intensity.slice(1),
      },
    ],
    [
      'an out-of-range field sample',
      {
        ...customResult.mode_profile,
        normalized_field: customResult.mode_profile.normalized_field.map(
          (row, index) =>
            index === 32
              ? row.map((value, column) => (column === 32 ? 1.01 : value))
              : row,
        ),
      },
    ],
    [
      'a nonfinite intensity sample',
      {
        ...customResult.mode_profile,
        normalized_intensity:
          customResult.mode_profile.normalized_intensity.map((row, index) =>
            index === 32
              ? row.map((value, column) => (column === 32 ? Number.NaN : value))
              : row,
          ),
      },
    ],
    ['an even grid size', { ...customResult.mode_profile, grid_points: 64 }],
    ['an oversized grid', { ...customResult.mode_profile, grid_points: 67 }],
    [
      'a nonpositive mode radius',
      { ...customResult.mode_profile, mode_field_radius_um: 0 },
    ],
    [
      'a nonpositive grid extent',
      { ...customResult.mode_profile, grid_half_width_um: 0 },
    ],
    [
      'the wrong model',
      {
        ...customResult.mode_profile,
        model_manifest: { ...modeProfileManifest, model_id: 'wrong_model' },
      },
    ],
    [
      'the wrong model version',
      {
        ...customResult.mode_profile,
        model_manifest: { ...modeProfileManifest, model_version: '2.0.0' },
      },
    ],
    [
      'the wrong normalization convention',
      {
        ...customResult.mode_profile,
        model_manifest: {
          ...modeProfileManifest,
          normalization_convention: 'wrong_normalization',
        },
      },
    ],
    [
      'the wrong radius convention',
      {
        ...customResult.mode_profile,
        model_manifest: {
          ...modeProfileManifest,
          radius_convention: 'wrong_radius',
        },
      },
    ],
  ]

  test.each(malformedModeProfiles)(
    'rejects %s mode-profile data without using it',
    async (_description, malformedModeProfile) => {
      vi.useFakeTimers()
      const fetchMock = mockFetch({
        preview: [
          jsonResponse(customResult),
          jsonResponse({
            ...customResult,
            mode_profile: malformedModeProfile,
          }),
        ],
      })

      render(<App />)
      await settleDebounce()
      expect(modeProfileOutput()).toHaveTextContent('Center intensity: 1')

      fireEvent.change(numberInput(/Core radius/i), {
        target: { value: '4.2' },
      })
      await settleDebounce()

      expect(modeProfileOutput()).toHaveTextContent('null')
      expect(screen.getByTestId('ray-guidance')).toHaveTextContent('null')
      expect(screen.getByRole('alert')).toHaveTextContent(/^Preview failed\.$/)
      expect(
        screen.getByRole('region', { name: 'Level 1 preview' }),
      ).toBeVisible()
      expect(previewCalls(fetchMock)).toHaveLength(2)
    },
  )

  test('shows loading and update status while retaining the last successful result', async () => {
    vi.useFakeTimers()
    const first = deferred<Response>()
    const second = deferred<Response>()
    mockFetch({ preview: [first.promise, second.promise] })

    render(<App />)
    await settleDebounce()
    expect(screen.getByRole('status')).toHaveTextContent('Loading preview…')

    await act(async () => {
      first.resolve(jsonResponse(customResult))
      await Promise.resolve()
    })
    expect(
      screen.getByRole('region', { name: 'Level 1 preview' }),
    ).toBeVisible()

    fireEvent.change(numberInput(/Core radius/i), { target: { value: '4.3' } })
    await settleDebounce()
    expect(screen.getByRole('status')).toHaveTextContent('Updating preview…')
    expect(modeProfileOutput()).toHaveTextContent('null')
    expect(
      screen.getByText(
        'Mode count estimate is unavailable below the validity threshold.',
      ),
    ).toBeVisible()

    await act(async () => {
      second.resolve(jsonResponse({ ...customResult, warnings: [] }))
      await Promise.resolve()
    })
    expect(modeProfileOutput()).toHaveTextContent('Center intensity: 1')
    expect(screen.getByRole('status')).toHaveTextContent('Preview ready')
  })

  test('does not let an older or aborted response overwrite the latest result', async () => {
    vi.useFakeTimers()
    const first = deferred<Response>()
    const second = deferred<Response>()
    mockFetch({ preview: [first.promise, second.promise] })

    render(<App />)
    await settleDebounce()
    fireEvent.change(numberInput(/Core radius/i), { target: { value: '4.3' } })
    await settleDebounce()

    await act(async () => {
      second.resolve(jsonResponse({ ...customResult, warnings: [] }))
      await Promise.resolve()
    })
    expect(modeProfileOutput()).toHaveTextContent('Center intensity: 1')
    expect(
      screen.getByRole('region', { name: 'Level 1 preview' }),
    ).toHaveTextContent('No warnings.')

    await act(async () => {
      first.resolve(
        jsonResponse({
          ...customResult,
          warnings: [
            {
              ...customResult.warnings[0],
              message: 'Stale response warning',
            },
          ],
        }),
      )
      await Promise.resolve()
    })
    expect(screen.queryByText('Stale response warning')).not.toBeInTheDocument()
    expect(modeProfileOutput()).toHaveTextContent('Center intensity: 1')
  })

  test('renders exact summary units, model metadata, and warnings', async () => {
    vi.useFakeTimers()
    mockFetch({ preview: [jsonResponse(customResult)] })

    render(<App />)
    await settleDebounce()
    const preview = screen.getByRole('region', { name: 'Level 1 preview' })

    for (const label of [
      'Mode regime',
      'V-number',
      'Numerical aperture',
      'Section loss',
      'Output power',
      'Group delay',
      'Input pulse FWHM',
      'Output pulse FWHM',
    ]) {
      expect(within(preview).getByText(label, { exact: true })).toBeVisible()
    }
    expect(preview).toHaveTextContent('Single mode')
    expect(preview).toHaveTextContent('2.0133583577642065')
    expect(preview).toHaveTextContent('0.12114041439585586')
    expect(preview).toHaveTextContent('2.5 dB')
    expect(preview).toHaveTextContent('-5.5 dBm')
    expect(preview).toHaveTextContent('61209011.468860894 ps')
    expect(preview).toHaveTextContent('25 ps')
    expect(preview).toHaveTextContent('49.30770730829005 ps')
    expect(preview).toHaveTextContent('level1_single_section_simulation')
    expect(preview).toHaveTextContent('1.0.0')
    expect(
      within(preview).getByText(
        'Mode count estimate is unavailable below the validity threshold.',
      ),
    ).toBeVisible()
  })

  test('shows custom standards checks as off and G.652.D checks compactly', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch({
      preview: [jsonResponse(customResult), jsonResponse(g652dResult)],
    })

    render(<App />)
    await settleDebounce()
    const customPreview = screen.getByRole('region', {
      name: 'Level 1 preview',
    })
    expect(customPreview).toHaveTextContent(/Custom fibre/i)
    expect(customPreview).toHaveTextContent(/standards checks.*off/i)

    fireEvent.change(screen.getByRole('combobox', { name: 'Fibre preset' }), {
      target: { value: 'g652d' },
    })
    await settleDebounce()
    const g652dPreview = screen.getByRole('region', { name: 'Level 1 preview' })
    expect(g652dPreview).toHaveTextContent('G.652.D')
    expect(g652dPreview).toHaveTextContent(/Dispersion.*Pass/i)
    expect(g652dPreview).toHaveTextContent(/Attenuation.*Pass/i)
    expect(previewCalls(fetchMock)).toHaveLength(2)
  })
})

describe('Level 1 preview errors', () => {
  test('displays the message from a structured 422 response', async () => {
    vi.useFakeTimers()
    const message =
      'Core refractive index must exceed cladding refractive index.'
    mockFetch({
      preview: [
        jsonResponse(
          {
            error: {
              code: 'REQUEST_VALIDATION_ERROR',
              message,
              field: null,
              details: { errors: [] },
              trace_id: 'level1-test-trace',
            },
          },
          422,
        ),
      ],
    })

    render(<App />)
    await settleDebounce()

    expect(screen.getByRole('alert')).toHaveTextContent(message)
  })

  test('uses a stable generic alert for a malformed successful response', async () => {
    vi.useFakeTimers()
    mockFetch({ preview: [jsonResponse({ unexpected: true })] })

    render(<App />)
    await settleDebounce()

    expect(screen.getByRole('alert')).toHaveTextContent(/^Preview failed\.$/)
  })

  test('uses a stable service alert for a network failure', async () => {
    vi.useFakeTimers()
    mockFetch({ preview: [new Error('network failure')] })

    render(<App />)
    await settleDebounce()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to reach the preview service.',
    )
  })
})
