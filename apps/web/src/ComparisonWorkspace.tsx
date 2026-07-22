import { useId } from 'react'

import {
  formatComparisonNumber,
  getComparisonMetrics,
  getParameterDifferences,
  getPowerComparisonSeries,
  getRadialComparisonSeries,
  type ComparisonMetric,
  type ComparisonParameterDifference,
  type ComparisonResult,
  type ComparisonSeries,
} from './comparison'

export type ComparisonWorkspaceProps = {
  baseline: ComparisonResult | null
  variant: ComparisonResult | null
  onCaptureBaseline: () => void
  onClearBaseline: () => void
}

const VIEW_BOX = '0 0 760 390'
const PLOT = {
  left: 70,
  top: 24,
  width: 654,
  height: 278,
} as const
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const

function displayValue(value: number): string {
  return formatComparisonNumber(value)
}

function signedDisplayValue(value: number): string {
  const formatted = formatComparisonNumber(value)
  return value < 0 ? formatted : `+${formatted}`
}

function getDisplayDomain(
  domain: readonly [number, number],
): readonly [number, number] {
  const [first, second] = domain
  const minimum = Math.min(first, second)
  const maximum = Math.max(first, second)

  if (minimum !== maximum) {
    return [minimum, maximum]
  }

  const padding = Math.max(Math.abs(minimum) * 0.05, 1)
  return [minimum - padding, maximum + padding]
}

function displayCoordinate(
  value: number,
  domain: readonly [number, number],
  start: number,
  size: number,
  invert = false,
): number {
  const fraction = (value - domain[0]) / (domain[1] - domain[0])
  const bounded = Math.min(1, Math.max(0, fraction))
  return start + (invert ? 1 - bounded : bounded) * size
}

function makeTicks(domain: readonly [number, number]): number[] {
  return TICK_FRACTIONS.map(
    (fraction) => domain[0] + fraction * (domain[1] - domain[0]),
  )
}

function ComparisonLegend({ xUnit, yUnit }: { xUnit: string; yUnit: string }) {
  return (
    <ul className="comparison-legend" aria-label="Comparison legend">
      <li>
        <span className="comparison-legend-line comparison-legend-baseline" />
        <span>Baseline snapshot</span>
      </li>
      <li>
        <span className="comparison-legend-line comparison-legend-variant" />
        <span>Live current variant</span>
      </li>
      <li className="comparison-legend-units">
        x: {xUnit} · y: {yUnit}
      </li>
    </ul>
  )
}

function ComparisonOverlay({
  series,
  kind,
}: {
  series: ComparisonSeries
  kind: 'power' | 'radial'
}) {
  const id = useId().replace(/:/g, '')
  const title =
    kind === 'power'
      ? 'Power versus distance comparison'
      : 'LP01 radial intensity comparison'
  const titleId = `comparison-${kind}-title-${id}`
  const descriptionId = `comparison-${kind}-description-${id}`
  const xDomain = getDisplayDomain(series.xDomain)
  const yDomain = getDisplayDomain(series.yDomain)
  const xTicks = makeTicks(xDomain)
  const yTicks = makeTicks(yDomain)
  const xLabel = kind === 'power' ? 'Distance' : 'Radius r'
  const yLabel =
    kind === 'power' ? 'Optical power level' : 'Normalized intensity'
  const xUnit = kind === 'power' ? 'km' : 'µm'
  const yUnit = kind === 'power' ? 'dBm' : 'dimensionless'
  const baselinePoints = series.baseline
    .map(
      (point) =>
        `${displayCoordinate(point.x, xDomain, PLOT.left, PLOT.width)},${displayCoordinate(point.y, yDomain, PLOT.top, PLOT.height, true)}`,
    )
    .join(' ')
  const variantPoints = series.variant
    .map(
      (point) =>
        `${displayCoordinate(point.x, xDomain, PLOT.left, PLOT.width)},${displayCoordinate(point.y, yDomain, PLOT.top, PLOT.height, true)}`,
    )
    .join(' ')

  return (
    <figure className={`comparison-figure comparison-${kind}-figure`}>
      <div className="comparison-plot-wrap">
        <svg
          className="comparison-svg"
          role="img"
          viewBox={VIEW_BOX}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          <title id={titleId}>{title}</title>
          <desc id={descriptionId}>
            Exact backend samples for the baseline snapshot and live current
            variant use shared display domains. Lines join supplied samples for
            display only; no interpolation, resampling, or physics values are
            generated in the frontend.
          </desc>
          <g className="comparison-grid" aria-hidden="true">
            {yTicks.map((tick, index) => {
              const y = displayCoordinate(
                tick,
                yDomain,
                PLOT.top,
                PLOT.height,
                true,
              )
              return (
                <line
                  key={`y-grid-${index}`}
                  x1={PLOT.left}
                  x2={PLOT.left + PLOT.width}
                  y1={y}
                  y2={y}
                />
              )
            })}
            {xTicks.map((tick, index) => {
              const x = displayCoordinate(tick, xDomain, PLOT.left, PLOT.width)
              return (
                <line
                  key={`x-grid-${index}`}
                  x1={x}
                  x2={x}
                  y1={PLOT.top}
                  y2={PLOT.top + PLOT.height}
                />
              )
            })}
          </g>
          <g className="comparison-ticks" aria-hidden="true">
            {yTicks.map((tick, index) => (
              <text
                key={`y-tick-${index}`}
                x={PLOT.left - 10}
                y={
                  displayCoordinate(
                    tick,
                    yDomain,
                    PLOT.top,
                    PLOT.height,
                    true,
                  ) + 4
                }
                textAnchor="end"
              >
                {formatComparisonNumber(tick)}
              </text>
            ))}
            {xTicks.map((tick, index) => (
              <text
                key={`x-tick-${index}`}
                x={displayCoordinate(tick, xDomain, PLOT.left, PLOT.width)}
                y={PLOT.top + PLOT.height + 22}
                textAnchor="middle"
              >
                {formatComparisonNumber(tick)}
              </text>
            ))}
          </g>
          <line
            className="comparison-axis"
            x1={PLOT.left}
            x2={PLOT.left + PLOT.width}
            y1={PLOT.top + PLOT.height}
            y2={PLOT.top + PLOT.height}
          />
          <line
            className="comparison-axis"
            x1={PLOT.left}
            x2={PLOT.left}
            y1={PLOT.top}
            y2={PLOT.top + PLOT.height}
          />
          <text
            className="comparison-axis-label"
            x={PLOT.left + PLOT.width / 2}
            y={354}
            textAnchor="middle"
          >
            {xLabel} ({xUnit})
          </text>
          <text
            className="comparison-axis-label"
            transform={`rotate(-90 17 ${PLOT.top + PLOT.height / 2})`}
            x={17}
            y={PLOT.top + PLOT.height / 2}
            textAnchor="middle"
          >
            {yLabel} ({yUnit})
          </text>
          {series.baseline.length > 1 && (
            <polyline
              className={`comparison-line comparison-baseline-line comparison-${kind}-baseline-line`}
              points={baselinePoints}
            />
          )}
          {series.variant.length > 1 && (
            <polyline
              className={`comparison-line comparison-variant-line comparison-${kind}-variant-line`}
              points={variantPoints}
            />
          )}
          {series.baseline.map((point, index) => (
            <circle
              key={`baseline-${point.x}-${point.y}-${index}`}
              className={`comparison-point comparison-baseline-point comparison-${kind}-baseline-point`}
              data-series="baseline"
              data-x={point.x}
              data-y={point.y}
              {...(kind === 'power'
                ? {
                    'data-distance-km': point.x,
                    'data-power-dbm': point.y,
                  }
                : {
                    'data-radius-um': point.x,
                    'data-intensity': point.y,
                  })}
              cx={displayCoordinate(point.x, xDomain, PLOT.left, PLOT.width)}
              cy={displayCoordinate(
                point.y,
                yDomain,
                PLOT.top,
                PLOT.height,
                true,
              )}
              r={3.2}
            />
          ))}
          {series.variant.map((point, index) => (
            <circle
              key={`variant-${point.x}-${point.y}-${index}`}
              className={`comparison-point comparison-variant-point comparison-${kind}-variant-point`}
              data-series="variant"
              data-x={point.x}
              data-y={point.y}
              {...(kind === 'power'
                ? {
                    'data-distance-km': point.x,
                    'data-power-dbm': point.y,
                  }
                : {
                    'data-radius-um': point.x,
                    'data-intensity': point.y,
                  })}
              cx={displayCoordinate(point.x, xDomain, PLOT.left, PLOT.width)}
              cy={displayCoordinate(
                point.y,
                yDomain,
                PLOT.top,
                PLOT.height,
                true,
              )}
              r={3.2}
            />
          ))}
        </svg>
      </div>
      <figcaption>
        Exact backend samples are joined only for display. Frontend deltas are
        presentation of the backend results; no new physics samples are
        generated.
      </figcaption>
      <ComparisonLegend xUnit={xUnit} yUnit={yUnit} />
    </figure>
  )
}

function ResultFacts({
  baseline,
  variant,
}: {
  baseline: ComparisonResult
  variant: ComparisonResult
}) {
  const presetLabel = (preset: ComparisonResult['configuration']['preset']) =>
    preset === 'g652d' ? 'G.652.D' : 'Custom'
  const regimeLabel = (regime: ComparisonResult['guidance']['mode_regime']) =>
    regime === 'single_mode' ? 'Single-mode' : 'Multimode'

  return (
    <div className="comparison-result-facts">
      <div>
        <span>Baseline preset</span>
        <strong>{presetLabel(baseline.configuration.preset)}</strong>
      </div>
      <div>
        <span>Variant preset</span>
        <strong>{presetLabel(variant.configuration.preset)}</strong>
      </div>
      <div>
        <span>Baseline mode regime</span>
        <strong>{regimeLabel(baseline.guidance.mode_regime)}</strong>
      </div>
      <div>
        <span>Variant mode regime</span>
        <strong>{regimeLabel(variant.guidance.mode_regime)}</strong>
      </div>
    </div>
  )
}

function MetricsTable({ metrics }: { metrics: readonly ComparisonMetric[] }) {
  return (
    <div className="comparison-table-wrap">
      <table className="comparison-table">
        <caption>Numeric result comparison</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Baseline</th>
            <th scope="col">Variant</th>
            <th scope="col">Variant − baseline</th>
            <th scope="col">Unit</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.id}>
              <th scope="row">{metric.label}</th>
              <td>{displayValue(metric.baselineValue)}</td>
              <td>{displayValue(metric.variantValue)}</td>
              <td>{signedDisplayValue(metric.delta)}</td>
              <td>{metric.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DifferencesTable({
  differences,
}: {
  differences: readonly ComparisonParameterDifference[]
}) {
  if (differences.length === 0) {
    return (
      <p className="comparison-identical" role="status">
        Inputs are identical between the baseline snapshot and live current
        variant.
      </p>
    )
  }

  return (
    <div className="comparison-table-wrap">
      <table className="comparison-table comparison-input-table">
        <caption>Changed inputs</caption>
        <thead>
          <tr>
            <th scope="col">Input</th>
            <th scope="col">Baseline</th>
            <th scope="col">Variant</th>
            <th scope="col">Unit</th>
          </tr>
        </thead>
        <tbody>
          {differences.map((difference) => (
            <tr key={difference.field}>
              <th scope="row">{difference.label}</th>
              <td>{difference.baselineValue}</td>
              <td>{difference.variantValue}</td>
              <td>{difference.unit ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ComparisonContent({
  baseline,
  variant,
}: {
  baseline: ComparisonResult
  variant: ComparisonResult
}) {
  const metrics = getComparisonMetrics(baseline, variant)
  const differences = getParameterDifferences(
    baseline.configuration,
    variant.configuration,
  )
  const powerSeries = getPowerComparisonSeries(baseline, variant)
  const radialSeries = getRadialComparisonSeries(baseline, variant)

  return (
    <div className="comparison-content">
      <ResultFacts baseline={baseline} variant={variant} />

      <section
        className="comparison-section"
        aria-labelledby="comparison-metrics-title"
      >
        <header>
          <p className="workspace-kicker">Backend result deltas</p>
          <h3 id="comparison-metrics-title">Numeric results</h3>
        </header>
        <MetricsTable metrics={metrics} />
      </section>

      <section
        className="comparison-section"
        aria-labelledby="comparison-inputs-title"
      >
        <header>
          <p className="workspace-kicker">Configuration snapshot</p>
          <h3 id="comparison-inputs-title">Changed inputs</h3>
        </header>
        <DifferencesTable differences={differences} />
      </section>

      <section
        className="comparison-section comparison-plots"
        aria-labelledby="comparison-plots-title"
      >
        <header>
          <p className="workspace-kicker">Exact sample overlays</p>
          <h3 id="comparison-plots-title">Result series</h3>
          <p className="comparison-disclosure">
            The backend supplies each sample. The frontend performs only
            display-coordinate mapping; it does not interpolate, resample, or
            calculate new physics values.
          </p>
        </header>
        <div className="comparison-plot-grid">
          <ComparisonOverlay series={powerSeries} kind="power" />
          <ComparisonOverlay series={radialSeries} kind="radial" />
        </div>
      </section>
    </div>
  )
}

export function ComparisonWorkspace({
  baseline,
  variant,
  onCaptureBaseline,
  onClearBaseline,
}: ComparisonWorkspaceProps) {
  const hasBaseline = baseline !== null
  const hasVariant = variant !== null

  return (
    <section
      className="comparison-workspace"
      aria-labelledby="comparison-workspace-title"
    >
      <header className="workspace-options-bar comparison-header">
        <div>
          <p className="workspace-kicker">Baseline comparison</p>
          <h2 id="comparison-workspace-title">Compare</h2>
          <p>
            Baseline is a captured snapshot; variant is the live current
            validated preview.
          </p>
        </div>
        <div className="comparison-header-actions">
          {!hasBaseline ? (
            <button
              className="comparison-primary-action"
              type="button"
              disabled={!hasVariant}
              onClick={onCaptureBaseline}
            >
              Set current as baseline
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!hasVariant}
                onClick={onCaptureBaseline}
              >
                Replace baseline
              </button>
              <button type="button" onClick={onClearBaseline}>
                Clear baseline
              </button>
            </>
          )}
        </div>
      </header>

      {!hasBaseline ? (
        <div className="comparison-empty" role="status">
          <h3>No baseline snapshot</h3>
          <p>
            Wait for a validated current preview, then set it as the baseline.
            Change the inputs and wait for the matching validated preview to
            compare results.
          </p>
        </div>
      ) : !hasVariant ? (
        <div className="comparison-unavailable" role="status">
          <h3>Current variant unavailable</h3>
          <p>
            The baseline is retained. Current variant is unavailable until a
            validated matching preview returns, so stale comparison data is
            hidden.
          </p>
        </div>
      ) : (
        <ComparisonContent baseline={baseline} variant={variant} />
      )}
    </section>
  )
}
