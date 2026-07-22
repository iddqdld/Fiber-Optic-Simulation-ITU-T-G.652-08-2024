import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { ComparisonResult } from './comparison'
import { ComparisonWorkspace } from './ComparisonWorkspace'

type MockComparisonResult = ComparisonResult & {
  summary: { output_power_dbm: number }
  group_delay: { group_delay_ps: number }
  configuration: { preset: 'custom' | 'g652d'; fibre: { n_core: number } }
  guidance: { mode_regime: 'single_mode' | 'multimode' }
}

type MockConfiguration = MockComparisonResult['configuration']

vi.mock('./comparison', () => ({
  formatComparisonNumber: (value: number) => String(value),
  getComparisonMetrics: (
    baseline: MockComparisonResult,
    variant: MockComparisonResult,
  ) => [
    {
      id: 'output-power',
      label: 'Output power',
      baselineValue: baseline.summary.output_power_dbm,
      variantValue: variant.summary.output_power_dbm,
      delta:
        variant.summary.output_power_dbm - baseline.summary.output_power_dbm,
      unit: 'dBm',
    },
    {
      id: 'group-delay',
      label: 'Group delay',
      baselineValue: baseline.group_delay.group_delay_ps,
      variantValue: variant.group_delay.group_delay_ps,
      delta:
        variant.group_delay.group_delay_ps -
        baseline.group_delay.group_delay_ps,
      unit: 'ps',
    },
  ],
  getParameterDifferences: (
    baseline: MockConfiguration,
    variant: MockConfiguration,
  ) => {
    const differences = []
    if (baseline.preset !== variant.preset) {
      differences.push({
        field: 'preset',
        label: 'Fibre preset',
        baselineValue: baseline.preset,
        variantValue: variant.preset,
        delta: null,
        unit: null,
      })
    }
    if (baseline.fibre.n_core !== variant.fibre.n_core) {
      differences.push({
        field: 'fibre.n_core',
        label: 'Core refractive index',
        baselineValue: String(baseline.fibre.n_core),
        variantValue: String(variant.fibre.n_core),
        delta: variant.fibre.n_core - baseline.fibre.n_core,
        unit: 'dimensionless',
      })
    }
    return differences
  },
  getPowerComparisonSeries: () => ({
    baseline: [
      { x: 0, y: -3 },
      { x: 5, y: -4 },
      { x: 10, y: -5 },
    ],
    variant: [
      { x: 0, y: -2 },
      { x: 10, y: -4 },
    ],
    xDomain: [0, 10],
    yDomain: [-5, -2],
  }),
  getRadialComparisonSeries: () => ({
    baseline: [
      { x: 0, y: 1 },
      { x: 5, y: 0.2 },
    ],
    variant: [
      { x: 0, y: 1 },
      { x: 5, y: 0.4 },
    ],
    xDomain: [0, 5],
    yDomain: [0, 1],
  }),
}))

afterEach(cleanup)

function makeResult({
  preset = 'custom',
  nCore = 1.47,
  outputPower = -5,
  groupDelay = 61,
  modeRegime = 'single_mode',
}: {
  preset?: 'custom' | 'g652d'
  nCore?: number
  outputPower?: number
  groupDelay?: number
  modeRegime?: 'single_mode' | 'multimode'
} = {}) {
  return {
    configuration: {
      preset,
      fibre: { n_core: nCore },
    },
    summary: { output_power_dbm: outputPower },
    group_delay: { group_delay_ps: groupDelay },
    guidance: { mode_regime: modeRegime },
  } as unknown as MockComparisonResult
}

function renderWorkspace(
  baseline: MockComparisonResult | null,
  variant: MockComparisonResult | null,
) {
  return render(
    <ComparisonWorkspace
      baseline={baseline}
      variant={variant}
      onCaptureBaseline={vi.fn()}
      onClearBaseline={vi.fn()}
    />,
  )
}

describe('ComparisonWorkspace', () => {
  test('renders concise empty state and disables capture without a variant', () => {
    renderWorkspace(null, null)

    expect(screen.getByRole('heading', { name: 'Compare' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Set current as baseline' }),
    ).toBeDisabled()
    expect(screen.getByText('No baseline snapshot')).toBeVisible()
    expect(screen.getByText(/validated current preview/i)).toBeVisible()
  })

  test('fires the capture callback for a validated current variant', () => {
    const onCaptureBaseline = vi.fn()
    render(
      <ComparisonWorkspace
        baseline={null}
        variant={makeResult()}
        onCaptureBaseline={onCaptureBaseline}
        onClearBaseline={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', {
      name: 'Set current as baseline',
    })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(onCaptureBaseline).toHaveBeenCalledOnce()
  })

  test('retains baseline and hides stale comparison while variant is unavailable', () => {
    const onClearBaseline = vi.fn()
    render(
      <ComparisonWorkspace
        baseline={makeResult()}
        variant={null}
        onCaptureBaseline={vi.fn()}
        onClearBaseline={onClearBaseline}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Replace baseline' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Clear baseline' }))
    expect(onClearBaseline).toHaveBeenCalledOnce()
    expect(
      screen.getByText(/validated matching preview returns/i),
    ).toBeVisible()
    expect(screen.queryByText('Numeric results')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  test('fires replace and clear controls when both snapshots are present', () => {
    const onCaptureBaseline = vi.fn()
    const onClearBaseline = vi.fn()
    render(
      <ComparisonWorkspace
        baseline={makeResult()}
        variant={makeResult({ nCore: 1.48 })}
        onCaptureBaseline={onCaptureBaseline}
        onClearBaseline={onClearBaseline}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Replace baseline' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear baseline' }))
    expect(onCaptureBaseline).toHaveBeenCalledOnce()
    expect(onClearBaseline).toHaveBeenCalledOnce()
  })

  test('shows identical inputs and signed metric deltas with explicit units', () => {
    renderWorkspace(makeResult(), makeResult())

    expect(
      screen.getByText(/Inputs are identical between the baseline snapshot/i),
    ).toBeVisible()
    const outputRow = screen.getByRole('row', { name: /Output power/ })
    expect(within(outputRow).getAllByText('-5')).toHaveLength(2)
    expect(within(outputRow).getByText('+0')).toBeInTheDocument()
    expect(within(outputRow).getByText('dBm')).toBeInTheDocument()
    const delayRow = screen.getByRole('row', { name: /Group delay/ })
    expect(within(delayRow).getByText('ps')).toBeInTheDocument()
  })

  test('shows changed numeric and categorical input rows', () => {
    renderWorkspace(
      makeResult({ nCore: 1.47 }),
      makeResult({ preset: 'g652d', nCore: 1.48 }),
    )

    expect(screen.getByRole('row', { name: /Fibre preset/ })).toHaveTextContent(
      'custom',
    )
    expect(
      screen.getByRole('row', { name: /Core refractive index/ }),
    ).toHaveTextContent('1.47')
    expect(screen.queryByText(/Inputs are identical/)).not.toBeInTheDocument()
  })

  test('renders accessible exact-sample power and radial overlays with legends', () => {
    const { container } = renderWorkspace(
      makeResult(),
      makeResult({ nCore: 1.48 }),
    )

    const power = screen.getByRole('img', {
      name: 'Power versus distance comparison',
    })
    const radial = screen.getByRole('img', {
      name: 'LP01 radial intensity comparison',
    })
    expect(power.querySelector('title')).toHaveTextContent(
      'Power versus distance comparison',
    )
    expect(radial.querySelector('desc')).toHaveTextContent(
      /Exact backend samples/,
    )
    expect(
      container.querySelectorAll('.comparison-power-baseline-point'),
    ).toHaveLength(3)
    expect(
      container.querySelectorAll('.comparison-power-variant-point'),
    ).toHaveLength(2)
    expect(
      container.querySelectorAll('.comparison-radial-baseline-point'),
    ).toHaveLength(2)
    expect(
      container.querySelectorAll('.comparison-radial-variant-point'),
    ).toHaveLength(2)
    expect(
      container.querySelector('.comparison-power-baseline-point'),
    ).toHaveAttribute('data-distance-km', '0')
    expect(
      container.querySelector('.comparison-radial-variant-point'),
    ).toHaveAttribute('data-intensity', '1')
    expect(screen.getAllByText('Baseline snapshot')).toHaveLength(2)
    expect(screen.getAllByText('Live current variant')).toHaveLength(2)
    expect(screen.getByText(/display-coordinate mapping/i)).toBeVisible()
  })
})
