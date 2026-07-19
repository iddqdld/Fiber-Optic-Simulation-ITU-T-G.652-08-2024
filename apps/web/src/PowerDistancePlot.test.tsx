import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { PowerDistancePlot } from './PowerDistancePlot'
import {
  getPowerDistancePlotData,
  isValidPowerDistanceData,
  mapPowerDistanceToSvg,
  POWER_DISTANCE_SVG,
  type PowerDistanceData,
} from './powerDistancePlot'

afterEach(() => {
  cleanup()
})

function buildData(
  overrides: Partial<PowerDistanceData> = {},
): PowerDistanceData {
  return {
    lengthKm: 12.5,
    attenuationDbPerKm: 0.2,
    inputPowerDbm: -3,
    sectionLossDb: 2.5,
    outputPowerDbm: -5.5,
    distanceSamplesKm: [0, 3, 6.5, 12.5],
    powerSamplesDbm: [-3, -3.6, -4.3, -5.5],
    modelId: 'constant_fibre_attenuation',
    modelVersion: '1.0.0',
    ...overrides,
  }
}

describe('power distance validation and SVG mapping', () => {
  test('accepts backend samples and maps their exact endpoints', () => {
    const data = buildData()

    expect(isValidPowerDistanceData(data)).toBe(true)
    expect(getPowerDistancePlotData(data)?.distanceSamplesKm).toEqual(
      data.distanceSamplesKm,
    )

    const mapping = mapPowerDistanceToSvg(data)
    expect(mapping.xDomain).toEqual([0, 12.5])
    expect(mapping.yDomain).toEqual([-5.5, -3])
    expect(mapping.points[0]).toEqual({
      distanceKm: 0,
      powerDbm: -3,
      x: POWER_DISTANCE_SVG.plotLeft,
      y: POWER_DISTANCE_SVG.plotTop,
    })
    expect(mapping.points.at(-1)).toEqual({
      distanceKm: 12.5,
      powerDbm: -5.5,
      x: POWER_DISTANCE_SVG.plotLeft + POWER_DISTANCE_SVG.plotWidth,
      y: POWER_DISTANCE_SVG.plotTop + POWER_DISTANCE_SVG.plotHeight,
    })
    expect(mapping.isConstantPower).toBe(false)
    expect(mapping.isZeroLength).toBe(false)
  })

  test.each([
    ['non-finite length', { lengthKm: Number.NaN }],
    ['negative length', { lengthKm: -1 }],
    [
      'non-finite coefficient',
      { attenuationDbPerKm: Number.POSITIVE_INFINITY },
    ],
    ['negative coefficient', { attenuationDbPerKm: -0.1 }],
    ['non-finite input power', { inputPowerDbm: Number.NaN }],
    ['non-finite section loss', { sectionLossDb: Number.POSITIVE_INFINITY }],
    ['negative section loss', { sectionLossDb: -1 }],
    ['non-finite output power', { outputPowerDbm: Number.NaN }],
    ['output above input', { outputPowerDbm: -2 }],
    ['wrong model id', { modelId: 'other-model' }],
    ['wrong model version', { modelVersion: '2.0.0' }],
    ['empty distance samples', { distanceSamplesKm: [] }],
    [
      'more than 65 distance samples',
      {
        distanceSamplesKm: Array(66).fill(0),
        powerSamplesDbm: Array(66).fill(-3),
        lengthKm: 0,
        outputPowerDbm: -3,
      },
    ],
    ['unequal sample lengths', { powerSamplesDbm: [-3, -3.6, -4.3] }],
    [
      'non-finite distance sample',
      { distanceSamplesKm: [0, Number.NaN, 12.5] },
    ],
    ['non-finite power sample', { powerSamplesDbm: [-3, Number.NaN, -5.5] }],
    [
      'distance does not start at zero',
      { distanceSamplesKm: [1, 3, 6.5, 12.5] },
    ],
    ['distance endpoint mismatch', { distanceSamplesKm: [0, 3, 6.5, 12] }],
    [
      'distance is not strictly increasing',
      { distanceSamplesKm: [0, 6.5, 6.5, 12.5] },
    ],
    [
      'power does not start at input',
      { powerSamplesDbm: [-2.9, -3.6, -4.3, -5.5] },
    ],
    ['power endpoint mismatch', { powerSamplesDbm: [-3, -3.6, -4.3, -5.4] }],
    ['power increases', { powerSamplesDbm: [-3, -3.6, -3.4, -5.5] }],
  ])('rejects %s', (_name, overrides) => {
    const data = buildData(overrides as Partial<PowerDistanceData>)

    expect(isValidPowerDistanceData(data)).toBe(false)
    expect(getPowerDistancePlotData(data)).toBeNull()
  })

  test('requires exactly one zero-distance sample for a zero-length section', () => {
    const valid = buildData({
      lengthKm: 0,
      sectionLossDb: 0,
      outputPowerDbm: -3,
      distanceSamplesKm: [0],
      powerSamplesDbm: [-3],
    })
    const invalid = buildData({
      lengthKm: 0,
      sectionLossDb: 0,
      outputPowerDbm: -3,
      distanceSamplesKm: [0, 0],
      powerSamplesDbm: [-3, -3],
    })

    expect(isValidPowerDistanceData(valid)).toBe(true)
    expect(isValidPowerDistanceData(invalid)).toBe(false)
  })

  test('rejects sparse sample arrays as incomplete backend data', () => {
    const distances = Array<number>(4)
    distances[0] = 0
    distances[3] = 12.5

    expect(
      isValidPowerDistanceData(buildData({ distanceSamplesKm: distances })),
    ).toBe(false)
  })

  test('maps constant power and zero-length data without a division by zero', () => {
    const constant = buildData({
      outputPowerDbm: -3,
      distanceSamplesKm: [0, 6, 12.5],
      powerSamplesDbm: [-3, -3, -3],
    })
    const zeroLength = buildData({
      lengthKm: 0,
      sectionLossDb: 0,
      outputPowerDbm: -3,
      distanceSamplesKm: [0],
      powerSamplesDbm: [-3],
    })

    const constantMapping = mapPowerDistanceToSvg(constant)
    const zeroLengthMapping = mapPowerDistanceToSvg(zeroLength)
    const centerX =
      POWER_DISTANCE_SVG.plotLeft + POWER_DISTANCE_SVG.plotWidth / 2
    const centerY =
      POWER_DISTANCE_SVG.plotTop + POWER_DISTANCE_SVG.plotHeight / 2

    expect(constantMapping.isConstantPower).toBe(true)
    expect(constantMapping.points.every((point) => point.y === centerY)).toBe(
      true,
    )
    expect(zeroLengthMapping.isZeroLength).toBe(true)
    expect(zeroLengthMapping.points[0].x).toBe(centerX)
    expect(zeroLengthMapping.points[0].y).toBe(centerY)
  })
})

describe('PowerDistancePlot', () => {
  test('renders an explicit unavailable state without chart or table', () => {
    const { container } = render(<PowerDistancePlot attenuation={null} />)

    expect(
      screen.getByRole('heading', { name: 'Power versus distance' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('unavailable')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('table')).toBeNull()
  })

  test('renders malformed direct data as unavailable', () => {
    const { container } = render(
      <PowerDistancePlot
        attenuation={buildData({ powerSamplesDbm: [-3, Number.NaN, -5.5] })}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('unavailable')
    expect(container.querySelector('svg')).toBeNull()
  })

  test('renders an accessible chart, scalar facts, disclosures, and all numeric samples', () => {
    const data = buildData()
    const { container } = render(<PowerDistancePlot attenuation={data} />)

    const article = screen.getByRole('article', {
      name: 'Power versus distance',
    })
    expect(within(article).getByText('0.2 dB/km')).toBeInTheDocument()
    expect(within(article).getByText('2.5 dB')).toBeInTheDocument()
    expect(
      within(article).getByText('constant_fibre_attenuation (1.0.0)'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /SVG segments only join the exact supplied backend samples/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /dBm, a logarithmic power level rather than linear power/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /supplied and uniform; it excludes splice, connector, bend/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/no standards conformance inference/),
    ).toBeInTheDocument()

    const svg = screen.getByRole('img', { name: 'Power versus distance' })
    expect(svg).toHaveAttribute('viewBox', '0 0 720 420')
    expect(svg).toHaveTextContent('Distance (km)')
    expect(svg).toHaveTextContent('Optical power level (dBm)')
    expect(svg.querySelector('title')).toHaveTextContent(
      'Power versus distance',
    )
    expect(svg.querySelector('desc')).toHaveTextContent(
      'Exact backend optical power-level samples',
    )
    expect(svg.querySelector('polyline')).toBeInTheDocument()
    expect(svg.querySelectorAll('.power-distance-sample-point')).toHaveLength(4)
    expect(svg.querySelector('.power-distance-sample-point')).toHaveAttribute(
      'data-distance-km',
      '0',
    )
    expect(svg.querySelector('.power-distance-sample-point')).toHaveAttribute(
      'data-power-dbm',
      '-3',
    )

    expect(
      screen.getByText('Show exact power-distance samples').closest('details'),
    ).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Show exact power-distance samples'))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(5)
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(table).toHaveTextContent('6.5')
    expect(table).toHaveTextContent('-4.3')
    expect(
      table.querySelector('tbody tr:nth-child(3) td:first-child'),
    ).toHaveAttribute('data-exact-value', '6.5')
    expect(
      container.querySelectorAll('.power-distance-sample-point'),
    ).toHaveLength(4)
  })

  test('honestly describes constant power and zero-length sections', () => {
    const constant = buildData({
      outputPowerDbm: -3,
      distanceSamplesKm: [0, 6, 12.5],
      powerSamplesDbm: [-3, -3, -3],
    })
    const { container, rerender } = render(
      <PowerDistancePlot attenuation={constant} />,
    )

    expect(
      screen.getByText(/All supplied power samples are identical/),
    ).toBeInTheDocument()
    expect(container.querySelector('polyline')).toBeInTheDocument()

    const zeroLength = buildData({
      lengthKm: 0,
      sectionLossDb: 0,
      outputPowerDbm: -3,
      distanceSamplesKm: [0],
      powerSamplesDbm: [-3],
    })
    rerender(<PowerDistancePlot attenuation={zeroLength} />)

    expect(
      screen.getByText(/Zero-length section: the backend supplied one sample/),
    ).toBeInTheDocument()
    expect(container.querySelector('polyline')).toBeNull()
    expect(
      container.querySelectorAll('.power-distance-sample-point'),
    ).toHaveLength(1)
  })
})
