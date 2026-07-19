import { useId } from 'react'
import type { ModeProfileData } from './FibreGeometryView'
import {
  getRadialIntensityPlotData,
  RADIAL_INTENSITY_SVG,
  RADIAL_INTENSITY_VIEW_BOX,
} from './radialIntensityPlot'

const X_TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1]
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1]

function formatNumber(value: number): string {
  if (value === 0) {
    return '0'
  }

  return Number(value.toPrecision(12)).toString()
}

function formatRadiusRange(start: number, end: number): string {
  return `${formatNumber(start)}–${formatNumber(end)} µm`
}

function formatSampleValue(value: number): string {
  if (value === 0) {
    return '0'
  }

  if (Math.abs(value) < 0.000001) {
    return value.toExponential(8)
  }

  return Number(value.toPrecision(12)).toString()
}

export function RadialIntensityPlot({
  modeProfile,
}: {
  modeProfile: ModeProfileData | null
}) {
  const plotData = getRadialIntensityPlotData(modeProfile)
  const id = useId().replace(/:/g, '')
  const headingId = `radial-intensity-heading-${id}`
  const svgTitleId = `radial-intensity-svg-title-${id}`
  const descriptionId = `radial-intensity-description-${id}`
  const explanationId = `radial-intensity-explanation-${id}`

  return (
    <article className="radial-intensity-card" aria-labelledby={headingId}>
      <h2 id={headingId}>LP01 radial intensity</h2>

      {plotData === null ? (
        <p className="radial-intensity-status" role="status">
          Radial intensity plot unavailable: valid backend mode-profile data is
          required.
        </p>
      ) : (
        <>
          <dl className="radial-intensity-facts">
            <div>
              <dt>Supplied mode-field radius</dt>
              <dd>{formatNumber(plotData.modeFieldRadiusUm)} µm</dd>
            </div>
            <div>
              <dt>Sampled radius</dt>
              <dd>
                {formatRadiusRange(
                  plotData.svg.xDomain[0],
                  plotData.svg.xDomain[1],
                )}
              </dd>
            </div>
            <div>
              <dt>Non-negative-radius samples</dt>
              <dd>{plotData.radii.length}</dd>
            </div>
            <div>
              <dt>Normalized intensity</dt>
              <dd>0–1 (dimensionless)</dd>
            </div>
            <div>
              <dt>Approximate model</dt>
              <dd className="radial-intensity-model">
                {plotData.modelId} ({plotData.modelVersion})
              </dd>
            </div>
            <div>
              <dt>Normalization convention</dt>
              <dd className="radial-intensity-model">
                {plotData.normalizationConvention}
              </dd>
            </div>
            <div>
              <dt>Radius convention</dt>
              <dd className="radial-intensity-model">
                {plotData.radiusConvention} (1/e² intensity radius)
              </dd>
            </div>
          </dl>

          <figure className="radial-intensity-figure">
            <div className="radial-intensity-plot-wrap">
              <svg
                className="radial-intensity-svg"
                role="img"
                aria-describedby={`${descriptionId} ${explanationId}`}
                aria-labelledby={svgTitleId}
                viewBox={RADIAL_INTENSITY_VIEW_BOX}
              >
                <title id={svgTitleId}>LP01 radial intensity</title>
                <desc id={descriptionId}>
                  Backend normalized intensity samples from the y=0 row for
                  nonnegative x, mapped onto a fixed 0 to 1 intensity domain.
                </desc>

                <g className="radial-intensity-grid" aria-hidden="true">
                  {Y_TICKS.map((tick) => {
                    const y =
                      RADIAL_INTENSITY_SVG.plotTop +
                      (1 - tick) * RADIAL_INTENSITY_SVG.plotHeight

                    return (
                      <line
                        key={`horizontal-${tick}`}
                        x1={RADIAL_INTENSITY_SVG.plotLeft}
                        x2={
                          RADIAL_INTENSITY_SVG.plotLeft +
                          RADIAL_INTENSITY_SVG.plotWidth
                        }
                        y1={y}
                        y2={y}
                      />
                    )
                  })}
                  {X_TICK_FRACTIONS.map((fraction) => {
                    const x =
                      RADIAL_INTENSITY_SVG.plotLeft +
                      fraction * RADIAL_INTENSITY_SVG.plotWidth

                    return (
                      <line
                        key={`vertical-${fraction}`}
                        x1={x}
                        x2={x}
                        y1={RADIAL_INTENSITY_SVG.plotTop}
                        y2={
                          RADIAL_INTENSITY_SVG.plotTop +
                          RADIAL_INTENSITY_SVG.plotHeight
                        }
                      />
                    )
                  })}
                </g>

                <g className="radial-intensity-ticks" aria-hidden="true">
                  {Y_TICKS.map((tick) => {
                    const y =
                      RADIAL_INTENSITY_SVG.plotTop +
                      (1 - tick) * RADIAL_INTENSITY_SVG.plotHeight

                    return (
                      <text
                        key={`y-label-${tick}`}
                        x={RADIAL_INTENSITY_SVG.plotLeft - 12}
                        y={y + 4}
                        textAnchor="end"
                      >
                        {tick}
                      </text>
                    )
                  })}
                  {X_TICK_FRACTIONS.map((fraction) => {
                    const x =
                      RADIAL_INTENSITY_SVG.plotLeft +
                      fraction * RADIAL_INTENSITY_SVG.plotWidth

                    return (
                      <text
                        key={`x-label-${fraction}`}
                        x={x}
                        y={
                          RADIAL_INTENSITY_SVG.plotTop +
                          RADIAL_INTENSITY_SVG.plotHeight +
                          22
                        }
                        textAnchor="middle"
                      >
                        {formatNumber(
                          plotData.svg.xDomain[0] +
                            fraction *
                              (plotData.svg.xDomain[1] -
                                plotData.svg.xDomain[0]),
                        )}
                      </text>
                    )
                  })}
                </g>

                <line
                  className="radial-intensity-axis"
                  x1={RADIAL_INTENSITY_SVG.plotLeft}
                  x2={
                    RADIAL_INTENSITY_SVG.plotLeft +
                    RADIAL_INTENSITY_SVG.plotWidth
                  }
                  y1={
                    RADIAL_INTENSITY_SVG.plotTop +
                    RADIAL_INTENSITY_SVG.plotHeight
                  }
                  y2={
                    RADIAL_INTENSITY_SVG.plotTop +
                    RADIAL_INTENSITY_SVG.plotHeight
                  }
                />
                <line
                  className="radial-intensity-axis"
                  x1={RADIAL_INTENSITY_SVG.plotLeft}
                  x2={RADIAL_INTENSITY_SVG.plotLeft}
                  y1={RADIAL_INTENSITY_SVG.plotTop}
                  y2={
                    RADIAL_INTENSITY_SVG.plotTop +
                    RADIAL_INTENSITY_SVG.plotHeight
                  }
                />
                <text
                  className="radial-intensity-axis-label"
                  x={
                    RADIAL_INTENSITY_SVG.plotLeft +
                    RADIAL_INTENSITY_SVG.plotWidth / 2
                  }
                  y={390}
                  textAnchor="middle"
                >
                  Radius r (µm)
                </text>
                <text
                  className="radial-intensity-axis-label"
                  transform={`rotate(-90 18 ${
                    RADIAL_INTENSITY_SVG.plotTop +
                    RADIAL_INTENSITY_SVG.plotHeight / 2
                  })`}
                  x={18}
                  y={
                    RADIAL_INTENSITY_SVG.plotTop +
                    RADIAL_INTENSITY_SVG.plotHeight / 2
                  }
                  textAnchor="middle"
                >
                  Normalized intensity (dimensionless)
                </text>

                {plotData.svg.suppliedRadiusMarker !== null && (
                  <line
                    className="radial-intensity-radius-marker"
                    data-testid="radial-intensity-radius-marker"
                    data-radius-um={plotData.svg.suppliedRadiusMarker.radiusUm}
                    x1={plotData.svg.suppliedRadiusMarker.x}
                    x2={plotData.svg.suppliedRadiusMarker.x}
                    y1={RADIAL_INTENSITY_SVG.plotTop}
                    y2={
                      RADIAL_INTENSITY_SVG.plotTop +
                      RADIAL_INTENSITY_SVG.plotHeight
                    }
                  />
                )}

                <polyline
                  className="radial-intensity-sample-line"
                  points={plotData.svg.points
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                />
                {plotData.svg.points.map((point) => (
                  <circle
                    key={point.radiusUm}
                    className="radial-intensity-sample-point"
                    data-intensity={point.intensity}
                    data-radius-um={point.radiusUm}
                    cx={point.x}
                    cy={point.y}
                    r={3}
                  />
                ))}
              </svg>
            </div>
            <figcaption>
              The polyline visually joins exact backend samples and does not
              represent additional simulated or interpolated samples.
            </figcaption>
          </figure>

          {plotData.svg.suppliedRadiusMarker !== null ? (
            <p className="radial-intensity-marker-legend">
              <span aria-hidden="true" /> Supplied radius:{' '}
              {formatNumber(plotData.modeFieldRadiusUm)} µm (1/e field radius;
              1/e² intensity radius)
            </p>
          ) : (
            <p className="radial-intensity-marker-note">
              Supplied radius {formatNumber(plotData.modeFieldRadiusUm)} µm (1/e
              field radius; 1/e² intensity radius) is outside the sampled radius
              range, so no marker is shown.
            </p>
          )}

          <p id={explanationId} className="radial-intensity-explanation">
            Source: backend normalized_intensity at y=0 and x≥0. No curve fit,
            averaging of ±x, smoothing, physical-model recalculation, or
            interpolated samples are generated. SVG segments only connect the
            discrete returned samples for visual mapping and add no simulated
            values. Normalized intensity is not optical power. This is a
            Gaussian LP01 approximation, not an exact eigenmode/full-wave
            solution.
          </p>

          <details className="radial-intensity-details">
            <summary>Show all radial samples</summary>
            <p>
              Values are rounded for readability; the plot uses the exact
              backend values.
            </p>
            <div className="radial-intensity-table-wrap">
              <table>
                <caption>Non-negative-radius backend samples</caption>
                <thead>
                  <tr>
                    <th scope="col">Radius r (µm)</th>
                    <th scope="col">Normalized intensity (dimensionless)</th>
                  </tr>
                </thead>
                <tbody>
                  {plotData.radii.map((radiusUm, index) => {
                    const intensity = plotData.intensities[index]

                    return (
                      <tr key={radiusUm}>
                        <td data-exact-value={radiusUm}>
                          {formatSampleValue(radiusUm)}
                        </td>
                        <td data-exact-value={intensity}>
                          {formatSampleValue(intensity)}
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
