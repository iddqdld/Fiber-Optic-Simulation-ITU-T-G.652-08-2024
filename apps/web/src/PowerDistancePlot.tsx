import { useId } from 'react'
import type { PowerDistanceData } from './powerDistancePlot'
import {
  getPowerDistancePlotData,
  POWER_DISTANCE_SVG,
  POWER_DISTANCE_VIEW_BOX,
} from './powerDistancePlot'

const X_TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1]
const Y_TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1]

function formatExactNumber(value: number): string {
  return Object.is(value, -0) ? '-0' : String(value)
}

function formatDomainValue(
  domain: readonly [number, number],
  fraction: number,
): string {
  return formatExactNumber(domain[0] + fraction * (domain[1] - domain[0]))
}

export function PowerDistancePlot({
  attenuation,
}: {
  attenuation: PowerDistanceData | null
}) {
  const plotData = getPowerDistancePlotData(attenuation)
  const id = useId().replace(/:/g, '')
  const headingId = `power-distance-heading-${id}`
  const svgTitleId = `power-distance-svg-title-${id}`
  const descriptionId = `power-distance-description-${id}`
  const explanationId = `power-distance-explanation-${id}`

  return (
    <article className="power-distance-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Power versus distance</h2>

      {plotData === null ? (
        <p className="power-distance-status" role="status">
          Power versus distance unavailable: valid backend attenuation samples
          are required.
        </p>
      ) : (
        <>
          <dl className="power-distance-facts">
            <div>
              <dt>Section length</dt>
              <dd>{formatExactNumber(plotData.lengthKm)} km</dd>
            </div>
            <div>
              <dt>Attenuation coefficient</dt>
              <dd>{formatExactNumber(plotData.attenuationDbPerKm)} dB/km</dd>
            </div>
            <div>
              <dt>Input power level</dt>
              <dd>{formatExactNumber(plotData.inputPowerDbm)} dBm</dd>
            </div>
            <div>
              <dt>Section loss</dt>
              <dd>{formatExactNumber(plotData.sectionLossDb)} dB</dd>
            </div>
            <div>
              <dt>Output power level</dt>
              <dd>{formatExactNumber(plotData.outputPowerDbm)} dBm</dd>
            </div>
            <div>
              <dt>Samples</dt>
              <dd>{plotData.distanceSamplesKm.length}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd className="power-distance-model">
                {plotData.modelId} ({plotData.modelVersion})
              </dd>
            </div>
          </dl>

          <figure className="power-distance-figure">
            <div className="power-distance-plot-wrap">
              <svg
                className="power-distance-svg"
                role="img"
                aria-describedby={`${descriptionId} ${explanationId}`}
                aria-labelledby={svgTitleId}
                viewBox={POWER_DISTANCE_VIEW_BOX}
              >
                <title id={svgTitleId}>Power versus distance</title>
                <desc id={descriptionId}>
                  Exact backend optical power-level samples plotted against
                  distance in kilometres, with power shown in dBm.
                </desc>

                <g className="power-distance-grid" aria-hidden="true">
                  {Y_TICK_FRACTIONS.map((fraction) => {
                    const y =
                      POWER_DISTANCE_SVG.plotTop +
                      fraction * POWER_DISTANCE_SVG.plotHeight

                    return (
                      <line
                        key={`horizontal-${fraction}`}
                        x1={POWER_DISTANCE_SVG.plotLeft}
                        x2={
                          POWER_DISTANCE_SVG.plotLeft +
                          POWER_DISTANCE_SVG.plotWidth
                        }
                        y1={y}
                        y2={y}
                      />
                    )
                  })}
                  {X_TICK_FRACTIONS.map((fraction) => {
                    const x =
                      POWER_DISTANCE_SVG.plotLeft +
                      fraction * POWER_DISTANCE_SVG.plotWidth

                    return (
                      <line
                        key={`vertical-${fraction}`}
                        x1={x}
                        x2={x}
                        y1={POWER_DISTANCE_SVG.plotTop}
                        y2={
                          POWER_DISTANCE_SVG.plotTop +
                          POWER_DISTANCE_SVG.plotHeight
                        }
                      />
                    )
                  })}
                </g>

                <g className="power-distance-ticks" aria-hidden="true">
                  {Y_TICK_FRACTIONS.map((fraction) => {
                    const y =
                      POWER_DISTANCE_SVG.plotTop +
                      fraction * POWER_DISTANCE_SVG.plotHeight

                    return (
                      <text
                        key={`y-label-${fraction}`}
                        x={POWER_DISTANCE_SVG.plotLeft - 12}
                        y={y + 4}
                        textAnchor="end"
                      >
                        {formatDomainValue(plotData.svg.yDomain, 1 - fraction)}
                      </text>
                    )
                  })}
                  {X_TICK_FRACTIONS.map((fraction) => {
                    const x =
                      POWER_DISTANCE_SVG.plotLeft +
                      fraction * POWER_DISTANCE_SVG.plotWidth

                    return (
                      <text
                        key={`x-label-${fraction}`}
                        x={x}
                        y={
                          POWER_DISTANCE_SVG.plotTop +
                          POWER_DISTANCE_SVG.plotHeight +
                          22
                        }
                        textAnchor="middle"
                      >
                        {formatDomainValue(plotData.svg.xDomain, fraction)}
                      </text>
                    )
                  })}
                </g>

                <line
                  className="power-distance-axis"
                  x1={POWER_DISTANCE_SVG.plotLeft}
                  x2={
                    POWER_DISTANCE_SVG.plotLeft + POWER_DISTANCE_SVG.plotWidth
                  }
                  y1={
                    POWER_DISTANCE_SVG.plotTop + POWER_DISTANCE_SVG.plotHeight
                  }
                  y2={
                    POWER_DISTANCE_SVG.plotTop + POWER_DISTANCE_SVG.plotHeight
                  }
                />
                <line
                  className="power-distance-axis"
                  x1={POWER_DISTANCE_SVG.plotLeft}
                  x2={POWER_DISTANCE_SVG.plotLeft}
                  y1={POWER_DISTANCE_SVG.plotTop}
                  y2={
                    POWER_DISTANCE_SVG.plotTop + POWER_DISTANCE_SVG.plotHeight
                  }
                />
                <text
                  className="power-distance-axis-label"
                  x={
                    POWER_DISTANCE_SVG.plotLeft +
                    POWER_DISTANCE_SVG.plotWidth / 2
                  }
                  y={390}
                  textAnchor="middle"
                >
                  Distance (km)
                </text>
                <text
                  className="power-distance-axis-label"
                  transform={`rotate(-90 18 ${
                    POWER_DISTANCE_SVG.plotTop +
                    POWER_DISTANCE_SVG.plotHeight / 2
                  })`}
                  x={18}
                  y={
                    POWER_DISTANCE_SVG.plotTop +
                    POWER_DISTANCE_SVG.plotHeight / 2
                  }
                  textAnchor="middle"
                >
                  Optical power level (dBm)
                </text>

                {plotData.svg.points.length > 1 && (
                  <polyline
                    className="power-distance-sample-line"
                    points={plotData.svg.points
                      .map((point) => `${point.x},${point.y}`)
                      .join(' ')}
                  />
                )}
                {plotData.svg.points.map((point, index) => (
                  <circle
                    key={`${point.distanceKm}-${index}`}
                    className="power-distance-sample-point"
                    data-distance-km={point.distanceKm}
                    data-power-dbm={point.powerDbm}
                    cx={point.x}
                    cy={point.y}
                    r={3}
                  />
                ))}
              </svg>
            </div>
            <figcaption>
              SVG segments only join the exact supplied backend samples; no
              additional samples or interpolated physics values are generated.
            </figcaption>
          </figure>

          {plotData.svg.isConstantPower && (
            <p className="power-distance-note">
              All supplied power samples are identical. The constant range is
              shown at a centered display position without adding samples.
            </p>
          )}
          {plotData.svg.isZeroLength && (
            <p className="power-distance-note">
              Zero-length section: the backend supplied one sample at 0 km, so
              no segment is drawn.
            </p>
          )}

          <p id={explanationId} className="power-distance-explanation">
            Distance is in km. Optical power level is in dBm, a logarithmic
            power level rather than linear power. The attenuation coefficient is
            supplied and uniform; it excludes splice, connector, bend, and
            engineering-margin losses. This visualization makes no standards
            conformance inference.
          </p>

          <details className="power-distance-details">
            <summary>Show exact power-distance samples</summary>
            <p>
              The table displays the backend numeric samples as JavaScript
              number strings; original JSON lexical formatting is not preserved.
            </p>
            <div className="power-distance-table-wrap">
              <table>
                <caption>Backend numeric power-versus-distance samples</caption>
                <thead>
                  <tr>
                    <th scope="col">Distance (km)</th>
                    <th scope="col">Optical power level (dBm)</th>
                  </tr>
                </thead>
                <tbody>
                  {plotData.distanceSamplesKm.map((distanceKm, index) => {
                    const powerDbm = plotData.powerSamplesDbm[index]

                    return (
                      <tr key={`${distanceKm}-${index}`}>
                        <td data-exact-value={distanceKm}>
                          {formatExactNumber(distanceKm)}
                        </td>
                        <td data-exact-value={powerDbm}>
                          {formatExactNumber(powerDbm)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </article>
  )
}
