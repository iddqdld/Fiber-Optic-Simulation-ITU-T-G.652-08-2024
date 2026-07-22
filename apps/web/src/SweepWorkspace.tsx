import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import {
  SWEEP_METRIC_DEFINITIONS,
  SWEEP_PARAMETER_DEFINITIONS,
  formatSweepNumber,
  getCurrentSweepParameterValue,
  getSweepErrorMessage,
  getSweepMetricDefinition,
  getSweepParameterDefinition,
  getSweepSeries,
  isSweepResult,
  parseSweepRequest,
  type SweepBaseConfiguration,
  type SweepMetricId,
  type SweepParameter,
  type SweepResult,
} from './sweep'

export type SweepWorkspaceProps = {
  baseConfiguration: SweepBaseConfiguration | null
}

const DEFAULT_PARAMETER: SweepParameter = 'length_km'
const DEFAULT_METRIC: SweepMetricId = 'output-power'
const DEFAULT_SAMPLE_COUNT = '21'
const INVALID_SWEEP_RESPONSE = 'The sweep service returned an invalid result.'
const SWEEP_UNREACHABLE = 'Unable to reach the sweep service.'
const INVALID_LOCAL_SWEEP = 'Enter a valid sweep range and sample count.'
const VIEW_BOX = '0 0 760 410'
const PLOT = {
  left: 78,
  top: 26,
  width: 638,
  height: 286,
} as const
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const

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

function formatNullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined
    ? 'Unavailable'
    : formatSweepNumber(value)
}

function formatNullableCount(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unavailable' : String(value)
}

function formatStatus(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Not evaluated'
  }

  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatWarningCodes(
  codes: readonly string[] | null | undefined,
): string {
  if (codes === null || codes === undefined || codes.length === 0) {
    return 'None'
  }

  return codes.map(formatStatus).join(', ')
}

function SweepChart({
  result,
  metric,
}: {
  result: SweepResult
  metric: SweepMetricId
}) {
  const chartId = useId().replaceAll(':', '')
  const titleId = `sweep-chart-title-${chartId}`
  const descriptionId = `sweep-chart-description-${chartId}`
  const metricDefinition = getSweepMetricDefinition(metric)
  const parameterDefinition = getSweepParameterDefinition(
    result.request.parameter,
  )
  if (metricDefinition === undefined || parameterDefinition === undefined) {
    return null
  }

  const series = getSweepSeries(result, metric)
  const points = series.points
  const xDomain = getDisplayDomain(series.xDomain)
  const yDomain = getDisplayDomain(series.yDomain)
  const xTicks = makeTicks(xDomain)
  const yTicks = makeTicks(yDomain)
  const xLabel = `${parameterDefinition.label} (${result.parameter_unit})`
  const yLabel = `${metricDefinition.label} (${metricDefinition.unit})`
  const polylinePoints = points
    .map(
      (point) =>
        `${displayCoordinate(point.x, xDomain, PLOT.left, PLOT.width)},${displayCoordinate(point.y, yDomain, PLOT.top, PLOT.height, true)}`,
    )
    .join(' ')

  return (
    <figure className="sweep-figure">
      <div className="sweep-plot-wrap">
        <svg
          className="sweep-svg"
          role="img"
          viewBox={VIEW_BOX}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          <title id={titleId}>One-parameter sweep result</title>
          <desc id={descriptionId}>
            Exact backend points for the selected sweep parameter and metric use
            shared raw domains. The polyline joins those supplied points for
            display only; no interpolation, resampling, or frontend physics is
            performed.
          </desc>
          <g className="sweep-grid" aria-hidden="true">
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
                  key={`sweep-y-grid-${index}`}
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
                  key={`sweep-x-grid-${index}`}
                  x1={x}
                  x2={x}
                  y1={PLOT.top}
                  y2={PLOT.top + PLOT.height}
                />
              )
            })}
          </g>
          <g className="sweep-ticks" aria-hidden="true">
            {yTicks.map((tick, index) => (
              <text
                key={`sweep-y-tick-${index}`}
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
                {formatSweepNumber(tick)}
              </text>
            ))}
            {xTicks.map((tick, index) => (
              <text
                key={`sweep-x-tick-${index}`}
                x={displayCoordinate(tick, xDomain, PLOT.left, PLOT.width)}
                y={PLOT.top + PLOT.height + 22}
                textAnchor="middle"
              >
                {formatSweepNumber(tick)}
              </text>
            ))}
          </g>
          <line
            className="sweep-axis"
            x1={PLOT.left}
            x2={PLOT.left + PLOT.width}
            y1={PLOT.top + PLOT.height}
            y2={PLOT.top + PLOT.height}
          />
          <line
            className="sweep-axis"
            x1={PLOT.left}
            x2={PLOT.left}
            y1={PLOT.top}
            y2={PLOT.top + PLOT.height}
          />
          <text
            className="sweep-axis-label"
            x={PLOT.left + PLOT.width / 2}
            y={365}
            textAnchor="middle"
          >
            {xLabel}
          </text>
          <text
            className="sweep-axis-label"
            transform={`rotate(-90 17 ${PLOT.top + PLOT.height / 2})`}
            x={17}
            y={PLOT.top + PLOT.height / 2}
            textAnchor="middle"
          >
            {yLabel}
          </text>
          {points.length > 1 && (
            <polyline
              className="sweep-line"
              points={polylinePoints}
              aria-hidden="true"
            />
          )}
          {points.map((point, index) => {
            const backendPoint = result.points[index]
            return (
              <circle
                key={`sweep-point-${index}`}
                className="sweep-point"
                data-sweep-point="true"
                data-point-index={index}
                data-parameter-value={backendPoint.parameter_value}
                data-metric-id={metric}
                data-metric-value={point.y}
                data-x={point.x}
                data-y={point.y}
                cx={displayCoordinate(point.x, xDomain, PLOT.left, PLOT.width)}
                cy={displayCoordinate(
                  point.y,
                  yDomain,
                  PLOT.top,
                  PLOT.height,
                  true,
                )}
                r={3.5}
              />
            )
          })}
        </svg>
      </div>
      <figcaption>
        Exact backend samples are shown as circles. The line joins those samples
        for display only: this frontend does not interpolate, resample, or
        calculate physics values. Raw domains are padded only for display when a
        domain has zero span.
      </figcaption>
    </figure>
  )
}

function SweepResultFacts({ result }: { result: SweepResult }) {
  const sampleCount = result.request.sample_count ?? result.points.length

  return (
    <div className="sweep-result-facts" aria-label="Sweep result facts">
      <div>
        <span>Model</span>
        <strong>{result.model_manifest.model_id}</strong>
      </div>
      <div>
        <span>Version</span>
        <strong>{result.model_manifest.model_version}</strong>
      </div>
      <div>
        <span>Spacing</span>
        <strong>{formatStatus(result.model_manifest.spacing)}</strong>
      </div>
      <div>
        <span>Samples</span>
        <strong>{formatNullableCount(sampleCount)}</strong>
      </div>
      <div>
        <span>Parameter range</span>
        <strong>
          {formatNullableNumber(result.request.start_value)}–
          {formatNullableNumber(result.request.stop_value)}{' '}
          {result.parameter_unit}
        </strong>
      </div>
    </div>
  )
}

function ExactSamplesTable({
  result,
  metric,
}: {
  result: SweepResult
  metric: SweepMetricId
}) {
  const metricDefinition = getSweepMetricDefinition(metric)
  const parameterDefinition = getSweepParameterDefinition(
    result.request.parameter,
  )
  if (metricDefinition === undefined || parameterDefinition === undefined) {
    return null
  }

  const series = getSweepSeries(result, metric)
  const points = series.points

  return (
    <details className="sweep-samples-details">
      <summary>Exact sweep samples</summary>
      <div className="sweep-table-wrap">
        <table className="sweep-table">
          <caption>Exact sweep samples</caption>
          <thead>
            <tr>
              <th scope="col">
                {parameterDefinition.label} ({result.parameter_unit})
              </th>
              <th scope="col">
                {metricDefinition.label} ({metricDefinition.unit})
              </th>
              <th scope="col">Mode regime</th>
              <th scope="col">Warning codes</th>
              <th scope="col">Dispersion status</th>
              <th scope="col">Attenuation status</th>
            </tr>
          </thead>
          <tbody>
            {result.points.map((point, index) => {
              const seriesPoint = points[index]
              return (
                <tr key={`sweep-row-${index}`}>
                  <th scope="row">
                    {formatSweepNumber(point.parameter_value)}{' '}
                    {result.parameter_unit}
                  </th>
                  <td>
                    {seriesPoint === undefined
                      ? 'Unavailable'
                      : formatSweepNumber(seriesPoint.y)}{' '}
                    {metricDefinition.unit}
                  </td>
                  <td>{formatStatus(point.mode_regime)}</td>
                  <td>{formatWarningCodes(point.warning_codes)}</td>
                  <td>{formatStatus(point.dispersion_standard_status)}</td>
                  <td>{formatStatus(point.attenuation_standard_status)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function SweepWorkspace({ baseConfiguration }: SweepWorkspaceProps) {
  const [parameter, setParameter] = useState<SweepParameter>(DEFAULT_PARAMETER)
  const [metric, setMetric] = useState<SweepMetricId>(DEFAULT_METRIC)
  const [startValue, setStartValue] = useState(() =>
    baseConfiguration === null
      ? ''
      : formatSweepNumber(
          getCurrentSweepParameterValue(baseConfiguration, DEFAULT_PARAMETER),
        ),
  )
  const [stopValue, setStopValue] = useState('')
  const [sampleCount, setSampleCount] = useState(DEFAULT_SAMPLE_COUNT)
  const [result, setResult] = useState<SweepResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const requestSequence = useRef(0)
  const abortController = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      requestSequence.current += 1
      abortController.current?.abort()
    }
  }, [])

  const invalidateRun = () => {
    requestSequence.current += 1
    abortController.current?.abort()
    abortController.current = null
    setPending(false)
    setResult(null)
    setError(null)
  }

  const handleParameterChange = (nextParameter: SweepParameter) => {
    invalidateRun()
    setParameter(nextParameter)

    if (baseConfiguration === null) {
      setStartValue('')
    } else {
      setStartValue(
        formatSweepNumber(
          getCurrentSweepParameterValue(baseConfiguration, nextParameter),
        ),
      )
    }

    setStopValue('')
  }

  const handleStartChange = (value: string) => {
    invalidateRun()
    setStartValue(value)
  }

  const handleStopChange = (value: string) => {
    invalidateRun()
    setStopValue(value)
  }

  const handleSampleCountChange = (value: string) => {
    invalidateRun()
    setSampleCount(value)
  }

  const runSweep = async () => {
    if (baseConfiguration === null) {
      return
    }

    requestSequence.current += 1
    const sequence = requestSequence.current
    abortController.current?.abort()
    const controller = new AbortController()
    abortController.current = controller
    setPending(false)
    setError(null)
    setResult(null)

    const parsed = parseSweepRequest(
      baseConfiguration,
      parameter,
      startValue,
      stopValue,
      sampleCount,
    )

    if (sequence !== requestSequence.current) {
      return
    }

    if (!parsed.success) {
      setError(parsed.error || INVALID_LOCAL_SWEEP)
      return
    }

    setPending(true)

    try {
      const response = await fetch('/api/v1/simulations/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.request),
        signal: controller.signal,
      })

      if (sequence !== requestSequence.current || controller.signal.aborted) {
        return
      }

      if (response.ok) {
        const successBody: unknown = await response.json()

        if (sequence !== requestSequence.current || controller.signal.aborted) {
          return
        }

        if (!isSweepResult(successBody, parsed.request)) {
          throw new Error(INVALID_SWEEP_RESPONSE)
        }

        setResult(successBody)
        setError(null)
      } else {
        const errorBody: unknown = await response.json()

        if (sequence !== requestSequence.current || controller.signal.aborted) {
          return
        }

        setError(
          getSweepErrorMessage(errorBody) ?? 'The sweep request was rejected.',
        )
      }
    } catch (caughtError) {
      if (
        sequence !== requestSequence.current ||
        controller.signal.aborted ||
        (caughtError instanceof DOMException &&
          caughtError.name === 'AbortError')
      ) {
        return
      }

      setError(
        caughtError instanceof Error &&
          caughtError.message === INVALID_SWEEP_RESPONSE
          ? INVALID_SWEEP_RESPONSE
          : SWEEP_UNREACHABLE,
      )
    } finally {
      if (sequence === requestSequence.current) {
        setPending(false)
        if (abortController.current === controller) {
          abortController.current = null
        }
      }
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runSweep()
  }

  const parameterDefinition = getSweepParameterDefinition(parameter)
  if (parameterDefinition === undefined) {
    return null
  }

  const currentValue =
    baseConfiguration === null
      ? null
      : getCurrentSweepParameterValue(baseConfiguration, parameter)

  return (
    <section
      className="sweep-workspace"
      aria-labelledby="sweep-workspace-title"
    >
      <header className="sweep-header">
        <div>
          <p className="workspace-kicker">Deterministic analysis</p>
          <h2 id="sweep-workspace-title">One-parameter sweep</h2>
          <p>
            Evaluate one backend parameter across an explicit linear range while
            keeping the current Inspector configuration as the base.
          </p>
        </div>
        <div className="sweep-header-status" role="status" aria-live="polite">
          {pending
            ? 'Running sweep…'
            : result === null
              ? 'Ready'
              : 'Sweep complete'}
        </div>
      </header>

      <form className="sweep-controls" onSubmit={handleSubmit}>
        <div className="sweep-control-grid">
          <label htmlFor="sweep-parameter">
            Sweep parameter
            <select
              id="sweep-parameter"
              value={parameter}
              disabled={baseConfiguration === null}
              aria-describedby="sweep-parameter-guidance"
              onChange={(event) =>
                handleParameterChange(event.target.value as SweepParameter)
              }
            >
              {SWEEP_PARAMETER_DEFINITIONS.map((definition) => (
                <option key={definition.parameter} value={definition.parameter}>
                  {definition.label} ({definition.unit})
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="sweep-metric">
            Output metric
            <select
              id="sweep-metric"
              value={metric}
              disabled={baseConfiguration === null}
              onChange={(event) =>
                setMetric(event.target.value as SweepMetricId)
              }
            >
              {SWEEP_METRIC_DEFINITIONS.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.label} ({definition.unit})
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="sweep-start">
            Start ({parameterDefinition.unit})
            <input
              id="sweep-start"
              type="number"
              step="any"
              inputMode="decimal"
              value={startValue}
              disabled={baseConfiguration === null}
              aria-describedby="sweep-parameter-guidance"
              onChange={(event) => handleStartChange(event.target.value)}
            />
          </label>
          <label htmlFor="sweep-stop">
            Stop ({parameterDefinition.unit})
            <input
              id="sweep-stop"
              type="number"
              step="any"
              inputMode="decimal"
              value={stopValue}
              disabled={baseConfiguration === null}
              aria-describedby="sweep-parameter-guidance"
              onChange={(event) => handleStopChange(event.target.value)}
            />
          </label>
          <label htmlFor="sweep-sample-count">
            Sample count
            <input
              id="sweep-sample-count"
              type="number"
              min="2"
              max="200"
              step="1"
              inputMode="numeric"
              value={sampleCount}
              disabled={baseConfiguration === null}
              aria-describedby="sweep-parameter-guidance"
              onChange={(event) => handleSampleCountChange(event.target.value)}
            />
          </label>
          <div className="sweep-current-value" aria-live="polite">
            <span>Current value</span>
            <strong>
              {currentValue === null
                ? 'Unavailable'
                : `${formatSweepNumber(currentValue)} ${parameterDefinition.unit}`}
            </strong>
          </div>
        </div>
        <p id="sweep-parameter-guidance" className="sweep-guidance">
          Check the Inspector boundary guidance for the selected parameter and
          related fields. Sweep controls do not calculate safe physics limits or
          automatically balance field values.
        </p>
        <div className="sweep-control-actions">
          <button
            className="sweep-run-button"
            type="submit"
            disabled={baseConfiguration === null}
            aria-busy={pending}
          >
            Run sweep
          </button>
          {error !== null && (
            <p className="sweep-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </form>

      {baseConfiguration === null && (
        <section
          className="sweep-unavailable"
          aria-labelledby="sweep-unavailable-title"
        >
          <h3 id="sweep-unavailable-title">Sweep unavailable</h3>
          <p>
            Complete a valid Inspector configuration to enable this workspace.
          </p>
        </section>
      )}

      {result !== null && (
        <div className="sweep-content">
          <SweepResultFacts result={result} />
          <section
            className="sweep-section"
            aria-labelledby="sweep-chart-section-title"
          >
            <header>
              <p className="workspace-kicker">Exact backend samples</p>
              <h3 id="sweep-chart-section-title">Result chart</h3>
              <label
                className="sweep-result-metric"
                htmlFor="sweep-result-metric"
              >
                Display metric
                <select
                  id="sweep-result-metric"
                  value={metric}
                  onChange={(event) =>
                    setMetric(event.target.value as SweepMetricId)
                  }
                >
                  {SWEEP_METRIC_DEFINITIONS.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.label} ({definition.unit})
                    </option>
                  ))}
                </select>
              </label>
            </header>
            <SweepChart result={result} metric={metric} />
          </section>
          <ExactSamplesTable result={result} metric={metric} />
        </div>
      )}
    </section>
  )
}
