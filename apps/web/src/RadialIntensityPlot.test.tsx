import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import type { ModeProfileData } from './FibreGeometryView'
import { RadialIntensityPlot } from './RadialIntensityPlot'
import {
  extractPositiveRadialSamples,
  getRadialIntensityPlotData,
  isValidRadialModeProfile,
  mapRadialIntensityToSvg,
  RADIAL_INTENSITY_SVG,
} from './radialIntensityPlot'

afterEach(() => {
  cleanup()
})

function buildProfile(
  overrides: Partial<ModeProfileData> = {},
): ModeProfileData {
  return {
    modeFieldRadiusUm: 4.82,
    gridHalfWidthUm: 1,
    gridPoints: 3,
    xUm: [-1, 0, 1],
    yUm: [-1, 0, 1],
    normalizedIntensity: [
      [0.2, 0.3, 0.4],
      [0.11, 1, 0.22],
      [0.5, 0.6, 0.7],
    ],
    modelId: 'gaussian_lp01_mode_profile',
    modelVersion: '1.0.0',
    normalizationConvention: 'unit_peak_field_and_intensity',
    radiusConvention: '1/e_field_radius',
    ...overrides,
  }
}

function buildDefaultProfile(): ModeProfileData {
  const gridPoints = 65
  const centerIndex = (gridPoints - 1) / 2
  const axis = Array.from(
    { length: gridPoints },
    (_, index) => (index - centerIndex) * 0.46875,
  )
  const positiveSide = [
    1,
    0.9812622474073953,
    0.9271294175839968,
    ...Array.from({ length: 29 }, (_, index) => 0.8 - index * 0.025),
    3.871974652848116e-9,
  ]
  const normalizedIntensity = axis.map(() =>
    Array.from({ length: gridPoints }, () => 0.02),
  )
  normalizedIntensity[centerIndex] = [
    ...Array.from({ length: centerIndex }, () => 0.13),
    ...positiveSide,
  ]

  return buildProfile({
    modeFieldRadiusUm: 4.82,
    gridHalfWidthUm: 15,
    gridPoints,
    xUm: axis,
    yUm: axis,
    normalizedIntensity,
  })
}

describe('radial intensity profile validation and extraction', () => {
  test('takes exact positive samples from the center y=0 row without averaging', () => {
    const profile = buildProfile()

    expect(extractPositiveRadialSamples(profile)).toEqual({
      modeFieldRadiusUm: 4.82,
      gridHalfWidthUm: 1,
      gridPoints: 3,
      modelId: 'gaussian_lp01_mode_profile',
      modelVersion: '1.0.0',
      normalizationConvention: 'unit_peak_field_and_intensity',
      radiusConvention: '1/e_field_radius',
      radii: [0, 1],
      intensities: [1, 0.22],
    })
  })

  test('reproduces the default 65 by 65 positive-side sample count and endpoints', () => {
    const samples = extractPositiveRadialSamples(buildDefaultProfile())

    expect(samples).not.toBeNull()
    expect(samples?.radii).toHaveLength(33)
    expect(samples?.radii.slice(0, 2)).toEqual([0, 0.46875])
    expect(samples?.intensities.slice(0, 3)).toEqual([
      1, 0.9812622474073953, 0.9271294175839968,
    ])
    expect(samples?.radii.at(-1)).toBe(15)
    expect(samples?.intensities.at(-1)).toBe(3.871974652848116e-9)
    expect(samples?.modeFieldRadiusUm).toBe(4.82)
  })

  test('maps exact sample endpoints to the plot edges and keeps y domain at 0 to 1', () => {
    const mapping = mapRadialIntensityToSvg({
      modeFieldRadiusUm: 2,
      gridHalfWidthUm: 4,
      gridPoints: 3,
      modelId: 'gaussian_lp01_mode_profile',
      modelVersion: '1.0.0',
      normalizationConvention: 'unit_peak_field_and_intensity',
      radiusConvention: '1/e_field_radius',
      radii: [0, 2, 4],
      intensities: [1, 0.25, 0],
    })

    expect(mapping.xDomain).toEqual([0, 4])
    expect(mapping.yDomain).toEqual([0, 1])
    expect(mapping.points[0]).toEqual({
      radiusUm: 0,
      intensity: 1,
      x: RADIAL_INTENSITY_SVG.plotLeft,
      y: RADIAL_INTENSITY_SVG.plotTop,
    })
    expect(mapping.points.at(-1)).toEqual({
      radiusUm: 4,
      intensity: 0,
      x: RADIAL_INTENSITY_SVG.plotLeft + RADIAL_INTENSITY_SVG.plotWidth,
      y: RADIAL_INTENSITY_SVG.plotTop + RADIAL_INTENSITY_SVG.plotHeight,
    })
  })

  test('shows a supplied-radius marker only inside the sampled radius', () => {
    const inside = getRadialIntensityPlotData(
      buildProfile({ modeFieldRadiusUm: 0.5 }),
    )
    const outside = getRadialIntensityPlotData(
      buildProfile({ modeFieldRadiusUm: 1.01 }),
    )

    expect(inside?.svg.suppliedRadiusMarker).not.toBeNull()
    expect(inside?.svg.suppliedRadiusMarker?.radiusUm).toBe(0.5)
    expect(outside?.svg.suppliedRadiusMarker).toBeNull()
  })

  test.each([
    ['null profile', null],
    ['non-finite mode radius', { modeFieldRadiusUm: Number.NaN }],
    ['non-positive grid half-width', { gridHalfWidthUm: 0 }],
    ['infinite grid half-width', { gridHalfWidthUm: Number.POSITIVE_INFINITY }],
    ['even grid', { gridPoints: 4 }],
    ['grid below minimum', { gridPoints: 1 }],
    ['grid above maximum', { gridPoints: 67 }],
    ['x shape', { xUm: [-1, 0] }],
    ['y shape', { yUm: [-1, 0] }],
    ['intensity matrix shape', { normalizedIntensity: [[1]] }],
    [
      'intensity row shape',
      {
        normalizedIntensity: [
          [0, 0, 0],
          [0, 1],
          [0, 0, 0],
        ],
      },
    ],
    ['non-finite axis', { xUm: [-1, Number.NaN, 1] }],
    [
      'non-finite intensity',
      {
        normalizedIntensity: [
          [0, 0, 0],
          [0, Number.NaN, 0],
          [0, 0, 0],
        ],
      },
    ],
    [
      'intensity below range',
      {
        normalizedIntensity: [
          [0, 0, 0],
          [0, -0.01, 0],
          [0, 0, 0],
        ],
      },
    ],
    [
      'intensity above range',
      {
        normalizedIntensity: [
          [0, 0, 0],
          [0, 1.01, 0],
          [0, 0, 0],
        ],
      },
    ],
    ['x not increasing', { xUm: [-1, -1, 1], yUm: [-1, 0, 1] }],
    ['y not increasing', { xUm: [-1, 0, 1], yUm: [-1, -1, 1] }],
    ['axes differ', { yUm: [-1, 0.1, 1] }],
    ['x endpoint mismatch', { xUm: [-0.9, 0, 1] }],
    ['y endpoint mismatch', { yUm: [-1, 0, 0.9] }],
    ['x center mismatch', { xUm: [-1, 0.1, 1], yUm: [-1, 0.1, 1] }],
    ['y center mismatch', { xUm: [-1, 0, 1], yUm: [-1, 0.1, 1] }],
    [
      'center intensity mismatch',
      {
        normalizedIntensity: [
          [0, 0, 0],
          [0, 0.99, 0],
          [0, 0, 0],
        ],
      },
    ],
    ['model id mismatch', { modelId: 'other-model' }],
    ['model version mismatch', { modelVersion: '2.0.0' }],
    ['normalization mismatch', { normalizationConvention: 'field_only' }],
    [
      'radius convention mismatch',
      { radiusConvention: '1/e2_intensity_radius' },
    ],
  ])('rejects %s', (_name, overrides) => {
    const profile =
      overrides === null
        ? null
        : buildProfile(overrides as Partial<ModeProfileData>)

    expect(isValidRadialModeProfile(profile)).toBe(false)
    expect(getRadialIntensityPlotData(profile)).toBeNull()
  })
})

describe('RadialIntensityPlot', () => {
  test('renders an explicit unavailable state without SVG or table for null data', () => {
    const { container } = render(<RadialIntensityPlot modeProfile={null} />)

    expect(
      screen.getByRole('heading', { name: 'LP01 radial intensity' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('article', { name: 'LP01 radial intensity' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('unavailable')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('table')).toBeNull()
  })

  test('renders the same unavailable state for directly supplied malformed data', () => {
    const { container } = render(
      <RadialIntensityPlot
        modeProfile={buildProfile({ modelVersion: '2.0.0' })}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('unavailable')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('table')).toBeNull()
  })

  test('renders accessible chart, facts, disclosures, marker, and every table sample', () => {
    const profile = buildDefaultProfile()
    const { container } = render(<RadialIntensityPlot modeProfile={profile} />)

    expect(
      screen.getByRole('heading', { name: 'LP01 radial intensity' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Approximate model')).toBeInTheDocument()
    expect(screen.getByText('4.82 µm')).toBeInTheDocument()
    expect(
      screen.getByText('unit_peak_field_and_intensity'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/1\/e_field_radius \(1\/e² intensity radius\)/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Source: backend normalized_intensity at y=0 and x≥0/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/interpolated samples are generated/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /SVG segments only connect the discrete returned samples for visual mapping/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Normalized intensity is not optical power/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/not an exact eigenmode\/full-wave solution/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/1\/e field radius; 1\/e² intensity radius/),
    ).toBeInTheDocument()

    const svg = screen.getByRole('img', { name: 'LP01 radial intensity' })
    expect(svg).toHaveTextContent('Radius r (µm)')
    expect(svg).toHaveTextContent('Normalized intensity (dimensionless)')
    expect(svg).toHaveAttribute('viewBox', '0 0 720 420')
    expect(svg).toHaveAttribute('aria-labelledby')
    expect(svg.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2)
    expect(svg.querySelector('title')).toHaveTextContent(
      'LP01 radial intensity',
    )
    expect(svg.querySelector('desc')).toHaveTextContent(
      'Backend normalized intensity samples',
    )
    expect(svg.querySelector('polyline')).toBeInTheDocument()
    expect(svg.querySelectorAll('.radial-intensity-sample-point')).toHaveLength(
      33,
    )
    expect(
      screen.getByTestId('radial-intensity-radius-marker'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Supplied radius: 4.82 µm/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Show all radial samples'))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(34)
    expect(table.querySelectorAll('tbody tr')).toHaveLength(33)
    expect(table).toHaveTextContent('0.981262247407')
    expect(table).toHaveTextContent('3.87197465e-9')
    expect(
      screen.getByText(
        /Values are rounded for readability; the plot uses the exact backend values/,
      ),
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll('.radial-intensity-sample-point'),
    ).toHaveLength(33)
  })

  test('renders no marker when the supplied radius is outside the sampled range', () => {
    const { container } = render(
      <RadialIntensityPlot
        modeProfile={buildProfile({ modeFieldRadiusUm: 1.01 })}
      />,
    )

    expect(screen.queryByTestId('radial-intensity-radius-marker')).toBeNull()
    expect(
      screen.getByText(/outside the sampled radius range/),
    ).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
