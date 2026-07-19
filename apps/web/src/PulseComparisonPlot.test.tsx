import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { PulseComparisonPlot } from './PulseComparisonPlot'
import {
  gaussianPulseProfileValue,
  generateGaussianProfile,
  getPulseComparisonPlotData,
  isValidPulseComparisonData,
  mapPulseComparisonToSvg,
  PULSE_COMPARISON_SAMPLE_COUNT,
  PULSE_COMPARISON_SVG,
  type PulseComparisonData,
} from './pulseComparisonPlot'

afterEach(() => {
  cleanup()
})

function buildData(
  overrides: Partial<PulseComparisonData> = {},
): PulseComparisonData {
  return {
    lengthKm: 12.5,
    dispersionPsPerNmKm: 17,
    spectralWidthFwhmNm: 0.2,
    inputPulseFwhmPs: 25,
    accumulatedDispersionPsPerNm: 212.5,
    dispersionBroadeningFwhmPs: 42.5,
    outputPulseFwhmPs: 50,
    modelId: 'first_order_chromatic_pulse_broadening',
    modelVersion: '1.0.0',
    widthConvention: 'fwhm',
    ...overrides,
  }
}

describe('pulse comparison reconstruction and validation', () => {
  test('uses the exact normalized Gaussian center, half-maximum, and end values', () => {
    expect(gaussianPulseProfileValue(0)).toBe(1)
    expect(gaussianPulseProfileValue(-0.5)).toBe(0.5)
    expect(gaussianPulseProfileValue(0.5)).toBe(0.5)
    expect(gaussianPulseProfileValue(-1)).toBe(0.0625)
    expect(gaussianPulseProfileValue(1)).toBe(0.0625)

    const profile = generateGaussianProfile(25)
    expect(profile).toHaveLength(PULSE_COMPARISON_SAMPLE_COUNT)
    expect(profile[0].timePs).toBe(-25)
    expect(profile[32].timePs).toBe(0)
    expect(profile[64].timePs).toBe(25)
    expect(profile[0].normalizedValue).toBe(0.0625)
    expect(profile[16].normalizedValue).toBe(0.5)
    expect(profile[32].normalizedValue).toBe(1)
    expect(profile[48].normalizedValue).toBe(0.5)
    expect(profile[64].normalizedValue).toBe(0.0625)
  })

  test('creates 65 deterministic symmetric samples', () => {
    const profile = generateGaussianProfile(25)

    expect(profile.map((sample) => sample.normalizedTime)).toEqual(
      expect.arrayContaining([-1, -0.5, 0, 0.5, 1]),
    )
    expect(
      profile.every(
        (sample, index) =>
          sample.normalizedTime ===
          -profile[PULSE_COMPARISON_SAMPLE_COUNT - index - 1].normalizedTime,
      ),
    ).toBe(true)
    expect(
      profile.every(
        (sample, index) =>
          sample.normalizedValue ===
          profile[PULSE_COMPARISON_SAMPLE_COUNT - index - 1].normalizedValue,
      ),
    ).toBe(true)
  })

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['non-finite length', { lengthKm: Number.NaN }],
    ['infinite dispersion', { dispersionPsPerNmKm: Number.POSITIVE_INFINITY }],
    ['negative length', { lengthKm: -1 }],
    ['negative spectral width', { spectralWidthFwhmNm: -1 }],
    ['non-finite spectral width', { spectralWidthFwhmNm: Number.NaN }],
    ['zero input width', { inputPulseFwhmPs: 0 }],
    ['negative input width', { inputPulseFwhmPs: -1 }],
    ['non-finite input width', { inputPulseFwhmPs: Number.POSITIVE_INFINITY }],
    [
      'non-finite accumulated dispersion',
      { accumulatedDispersionPsPerNm: Number.NaN },
    ],
    ['negative broadening', { dispersionBroadeningFwhmPs: -1 }],
    [
      'non-finite broadening',
      { dispersionBroadeningFwhmPs: Number.POSITIVE_INFINITY },
    ],
    ['output narrower than input', { outputPulseFwhmPs: 24 }],
    ['non-finite output width', { outputPulseFwhmPs: Number.NaN }],
    ['wrong model id', { modelId: 'other-model' }],
    ['wrong model version', { modelVersion: '2.0.0' }],
    ['wrong width convention', { widthConvention: 'sigma' }],
  ])('rejects %s', (_name, overrides) => {
    const data =
      overrides === null || overrides === undefined
        ? overrides
        : buildData(overrides as Partial<PulseComparisonData>)

    expect(isValidPulseComparisonData(data)).toBe(false)
    expect(getPulseComparisonPlotData(data)).toBeNull()
  })

  test('rejects non-record values', () => {
    expect(isValidPulseComparisonData('not pulse data')).toBe(false)
    expect(getPulseComparisonPlotData('not pulse data' as never)).toBeNull()
  })

  test('accepts all scalar boundaries and does not recompute the backend equation', () => {
    const boundary = buildData({
      lengthKm: 0,
      dispersionPsPerNmKm: -Number.MAX_VALUE,
      spectralWidthFwhmNm: 0,
      accumulatedDispersionPsPerNm: -Number.MAX_VALUE,
      dispersionBroadeningFwhmPs: 0,
      inputPulseFwhmPs: Number.MIN_VALUE,
      outputPulseFwhmPs: Number.MIN_VALUE,
    })
    const inconsistent = buildData({
      inputPulseFwhmPs: 10,
      accumulatedDispersionPsPerNm: 999,
      dispersionBroadeningFwhmPs: 1,
      outputPulseFwhmPs: 11,
    })

    expect(isValidPulseComparisonData(boundary)).toBe(true)
    expect(isValidPulseComparisonData(inconsistent)).toBe(true)
    expect(getPulseComparisonPlotData(inconsistent)).not.toBeNull()
  })

  test('maps equal, extreme, and subnormal widths to finite SVG coordinates', () => {
    const equal = buildData({
      inputPulseFwhmPs: 25,
      outputPulseFwhmPs: 25,
      dispersionBroadeningFwhmPs: 0,
    })
    const extreme = buildData({
      inputPulseFwhmPs: Number.MAX_VALUE,
      outputPulseFwhmPs: Number.MAX_VALUE,
    })
    const subnormal = buildData({
      inputPulseFwhmPs: Number.MIN_VALUE,
      outputPulseFwhmPs: Number.MIN_VALUE * 2,
    })

    const equalMapping = getPulseComparisonPlotData(equal)?.svg
    expect(equalMapping?.inputPoints).toEqual(equalMapping?.outputPoints)
    expect(equalMapping?.inputFwhmMarker.leftX).toBe(
      equalMapping?.outputFwhmMarker.leftX,
    )
    expect(equalMapping?.inputFwhmMarker.rightX).toBe(
      equalMapping?.outputFwhmMarker.rightX,
    )

    for (const data of [extreme, subnormal]) {
      const mapping = mapPulseComparisonToSvg(data)
      expect(
        [...mapping.xDomain, ...mapping.yDomain].every(Number.isFinite),
      ).toBe(true)
      expect(
        [...mapping.inputPoints, ...mapping.outputPoints].every(
          (point) =>
            Number.isFinite(point.timePs) &&
            Number.isFinite(point.normalizedValue) &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y),
        ),
      ).toBe(true)
      expect(mapping.inputPoints).toHaveLength(65)
      expect(mapping.outputPoints).toHaveLength(65)
    }
  })

  test('uses a fixed 0..1 y-domain and division-first FWHM marker mapping', () => {
    const data = buildData({ inputPulseFwhmPs: 25, outputPulseFwhmPs: 50 })
    const mapping = mapPulseComparisonToSvg(data)
    const expectedCenterX =
      PULSE_COMPARISON_SVG.plotLeft + PULSE_COMPARISON_SVG.plotWidth / 2
    const expectedHalfY =
      PULSE_COMPARISON_SVG.plotTop + PULSE_COMPARISON_SVG.plotHeight / 2

    expect(mapping.xDomain).toEqual([-50, 50])
    expect(mapping.yDomain).toEqual([0, 1])
    expect(mapping.inputPoints[32].x).toBe(expectedCenterX)
    expect(mapping.outputPoints[32].x).toBe(expectedCenterX)
    expect(mapping.inputPoints[32].y).toBe(PULSE_COMPARISON_SVG.plotTop)
    expect(mapping.inputFwhmMarker.y).toBe(expectedHalfY)
    expect(mapping.outputFwhmMarker.leftX).toBe(
      PULSE_COMPARISON_SVG.plotLeft + PULSE_COMPARISON_SVG.plotWidth / 4,
    )
    expect(mapping.outputFwhmMarker.rightX).toBe(
      PULSE_COMPARISON_SVG.plotLeft + (3 * PULSE_COMPARISON_SVG.plotWidth) / 4,
    )
  })
})

describe('PulseComparisonPlot', () => {
  test('renders explicit unavailable state without chart or table for null data', () => {
    const { container } = render(<PulseComparisonPlot pulse={null} />)

    expect(
      screen.getByRole('heading', { name: 'Input/output pulse comparison' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('unavailable')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('table')).toBeNull()
  })

  test('renders directly supplied malformed data as unavailable', () => {
    const { container } = render(
      <PulseComparisonPlot pulse={buildData({ modelVersion: '2.0.0' })} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('unavailable')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('table')).toBeNull()
  })

  test('renders exact scalar facts, accessible chart, legend, markers, and disclosures', () => {
    const data = buildData()
    const { container } = render(<PulseComparisonPlot pulse={data} />)

    const article = screen.getByRole('article', {
      name: 'Input/output pulse comparison',
    })
    expect(within(article).getByText('12.5 km')).toBeInTheDocument()
    expect(within(article).getByText('17 ps/(nm·km)')).toBeInTheDocument()
    expect(within(article).getByText('0.2 nm')).toBeInTheDocument()
    expect(within(article).getByText('212.5 ps/nm')).toBeInTheDocument()
    expect(within(article).getByText('25 ps')).toBeInTheDocument()
    expect(within(article).getByText('42.5 ps')).toBeInTheDocument()
    expect(within(article).getByText('50 ps')).toBeInTheDocument()
    expect(
      within(article).getByText('first_order_chromatic_pulse_broadening'),
    ).toBeInTheDocument()
    expect(within(article).getByText('1.0.0')).toBeInTheDocument()
    expect(within(article).getByText('fwhm')).toBeInTheDocument()

    const svg = screen.getByRole('img', {
      name: 'Input/output pulse comparison',
    })
    expect(svg).toHaveAttribute('viewBox', '0 0 720 420')
    expect(svg.querySelector('title')).toHaveTextContent(
      'Input/output pulse comparison',
    )
    expect(svg.querySelector('desc')).toHaveTextContent(
      'unit-peak normalized Gaussian FWHM profiles',
    )
    expect(svg).toHaveTextContent('Relative time t (ps)')
    expect(svg).toHaveTextContent('Unit-peak normalized profile')
    expect(
      svg.querySelector('.pulse-comparison-input-line'),
    ).toBeInTheDocument()
    expect(
      svg.querySelector('.pulse-comparison-output-line'),
    ).toBeInTheDocument()
    expect(svg.querySelectorAll('.pulse-comparison-input-point')).toHaveLength(
      65,
    )
    expect(svg.querySelectorAll('.pulse-comparison-output-point')).toHaveLength(
      65,
    )

    const markers = svg.querySelectorAll('.pulse-comparison-fwhm-marker')
    expect(markers).toHaveLength(2)
    expect(
      [...markers].every((marker) => marker.getAttribute('data-y') === '0.5'),
    ).toBe(true)
    expect(screen.getByLabelText('Curve legend')).toHaveTextContent(
      'Input Gaussian profile',
    )
    expect(screen.getByLabelText('Curve legend')).toHaveTextContent(
      'Output Gaussian profile',
    )
    expect(screen.getByLabelText('Curve legend')).toHaveTextContent(
      'FWHM marker at normalized profile 0.5',
    )
    expect(
      screen.getByText(
        /frontend.*Gaussian input-pulse and Gaussian-broadening/i,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /do not encode optical power, attenuation, pulse energy/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/centered at relative t=0/)).toBeInTheDocument()
    expect(
      screen.getByText(/not full pulse propagation and excludes chirp/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/polarization-mode dispersion \(PMD\)/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No standards conformance inference/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Frontend-generated normalized Gaussian profiles are shown on one relative-time axis/,
      ),
    ).toBeInTheDocument()
    expect(container.querySelector('figcaption')).toBeInTheDocument()
  })

  test('labels the expandable table as reconstructed rather than backend samples', () => {
    const { container } = render(<PulseComparisonPlot pulse={buildData()} />)

    fireEvent.click(screen.getByText('Show reconstructed Gaussian samples'))
    const table = screen.getByRole('table')
    expect(table.querySelector('caption')).toHaveTextContent(
      'Reconstructed Gaussian pulse profile samples (not backend samples)',
    )
    expect(
      screen.getByText(/frontend-reconstructed samples, not backend samples/),
    ).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(66)
    expect(table.querySelectorAll('tbody tr')).toHaveLength(65)
    expect(table).toHaveTextContent('Input relative time (ps)')
    expect(table).toHaveTextContent('Output normalized profile')
    expect(
      container.querySelectorAll('.pulse-comparison-input-point'),
    ).toHaveLength(65)
  })

  test('describes equal-width and zero-broadening cases without hiding either curve', () => {
    const { container } = render(
      <PulseComparisonPlot
        pulse={buildData({
          inputPulseFwhmPs: 25,
          outputPulseFwhmPs: 25,
          dispersionBroadeningFwhmPs: 0,
        })}
      />,
    )

    expect(
      screen.getByText(/Equal input and output FWHM values/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/backend reports zero dispersion broadening/),
    ).toBeInTheDocument()
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
    expect(
      container.querySelectorAll('.pulse-comparison-fwhm-marker'),
    ).toHaveLength(2)
  })
})
