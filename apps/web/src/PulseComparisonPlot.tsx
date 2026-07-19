import { useId } from 'react'
import type {
  GaussianPulseSample,
  PulseComparisonData,
  PulseComparisonSvgPoint,
} from './pulseComparisonPlot'
import {
  getPulseComparisonPlotData,
  PULSE_COMPARISON_SVG,
  PULSE_COMPARISON_VIEW_BOX,
} from './pulseComparisonPlot'

const X_TICK_FRACTIONS = [-1, -0.5, 0, 0.5, 1]
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1]

function formatNumber(value: number): string {
  return Object.is(value, -0) ? '-0' : String(value)
}

function formatScaledTime(outputFwhmPs: number, fraction: number): string {
  const value = outputFwhmPs * fraction

  return value === 0 ? '0' : Number(value.toPrecision(6)).toString()
}

function pointsAttribute(points: PulseComparisonSvgPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function renderSampleRows(
  inputProfile: GaussianPulseSample[],
  outputProfile: GaussianPulseSample[],
) {
  return inputProfile.map((inputSample, index) => {
    const outputSample = outputProfile[index]

    return (
      <tr key={index}>
        <td>{index + 1}</td>
        <td data-exact-value={inputSample.timePs}>
          {formatNumber(inputSample.timePs)}
        </td>
        <td data-exact-value={inputSample.normalizedValue}>
          {formatNumber(inputSample.normalizedValue)}
        </td>
        <td data-exact-value={outputSample.timePs}>
          {formatNumber(outputSample.timePs)}
        </td>
        <td data-exact-value={outputSample.normalizedValue}>
          {formatNumber(outputSample.normalizedValue)}
        </td>
      </tr>
    )
  })
}

export function PulseComparisonPlot({
  pulse,
}: {
  pulse: PulseComparisonData | null
}) {
  const plotData = getPulseComparisonPlotData(pulse)
  const id = useId().replace(/:/g, '')
  const headingId = `pulse-comparison-heading-${id}`
  const svgTitleId = `pulse-comparison-svg-title-${id}`
  const descriptionId = `pulse-comparison-description-${id}`
  const explanationId = `pulse-comparison-explanation-${id}`

  return (
    <article className="pulse-comparison-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Input/output pulse comparison</h2>

      {plotData === null ? (
        <p className="pulse-comparison-status" role="status">
          Input/output pulse comparison unavailable: valid backend pulse
          broadening scalar data are required.
        </p>
      ) : (
        <>
          <dl className="pulse-comparison-facts">
            <div>
              <dt>Length</dt>
              <dd>{formatNumber(plotData.lengthKm)} km</dd>
            </div>
            <div>
              <dt>Dispersion</dt>
              <dd>{formatNumber(plotData.dispersionPsPerNmKm)} ps/(nm·km)</dd>
            </div>
            <div>
              <dt>Spectral width (FWHM)</dt>
              <dd>{formatNumber(plotData.spectralWidthFwhmNm)} nm</dd>
            </div>
            <div>
              <dt>Accumulated dispersion</dt>
              <dd>
                {formatNumber(plotData.accumulatedDispersionPsPerNm)} ps/nm
              </dd>
            </div>
            <div>
              <dt>Input pulse FWHM</dt>
              <dd>{formatNumber(plotData.inputPulseFwhmPs)} ps</dd>
            </div>
            <div>
              <dt>Dispersion broadening FWHM</dt>
              <dd>{formatNumber(plotData.dispersionBroadeningFwhmPs)} ps</dd>
            </div>
            <div>
              <dt>Output pulse FWHM</dt>
              <dd>{formatNumber(plotData.outputPulseFwhmPs)} ps</dd>
            </div>
            <div>
              <dt>Model ID</dt>
              <dd className="pulse-comparison-model">{plotData.modelId}</dd>
            </div>
            <div>
              <dt>Model version</dt>
              <dd>{plotData.modelVersion}</dd>
            </div>
            <div>
              <dt>Width convention</dt>
              <dd>{plotData.widthConvention}</dd>
            </div>
          </dl>

          <figure className="pulse-comparison-figure">
            <div className="pulse-comparison-plot-wrap">
              <svg
                className="pulse-comparison-svg"
                role="img"
                aria-labelledby={svgTitleId}
                aria-describedby={`${descriptionId} ${explanationId}`}
                viewBox={PULSE_COMPARISON_VIEW_BOX}
              >
                <title id={svgTitleId}>Input/output pulse comparison</title>
                <desc id={descriptionId}>
                  Two independently unit-peak normalized Gaussian FWHM profiles
                  reconstructed from backend scalar widths. The input and output
                  profiles share a fixed normalized vertical domain from zero to
                  one and a relative-time horizontal domain of minus to plus the
                  output FWHM.
                </desc>

                <g className="pulse-comparison-grid" aria-hidden="true">
                  {Y_TICKS.map((tick) => {
                    const y =
                      PULSE_COMPARISON_SVG.plotTop +
                      (1 - tick) * PULSE_COMPARISON_SVG.plotHeight

                    return (
                      <line
                        key={`horizontal-${tick}`}
                        x1={PULSE_COMPARISON_SVG.plotLeft}
                        x2={
                          PULSE_COMPARISON_SVG.plotLeft +
                          PULSE_COMPARISON_SVG.plotWidth
                        }
                        y1={y}
                        y2={y}
                      />
                    )
                  })}
                  {X_TICK_FRACTIONS.map((fraction) => {
                    const x =
                      PULSE_COMPARISON_SVG.plotLeft +
                      ((fraction + 1) / 2) * PULSE_COMPARISON_SVG.plotWidth

                    return (
                      <line
                        key={`vertical-${fraction}`}
                        x1={x}
                        x2={x}
                        y1={PULSE_COMPARISON_SVG.plotTop}
                        y2={
                          PULSE_COMPARISON_SVG.plotTop +
                          PULSE_COMPARISON_SVG.plotHeight
                        }
                      />
                    )
                  })}
                </g>

                <g className="pulse-comparison-ticks" aria-hidden="true">
                  {Y_TICKS.map((tick) => {
                    const y =
                      PULSE_COMPARISON_SVG.plotTop +
                      (1 - tick) * PULSE_COMPARISON_SVG.plotHeight

                    return (
                      <text
                        key={`y-label-${tick}`}
                        x={PULSE_COMPARISON_SVG.plotLeft - 12}
                        y={y + 4}
                        textAnchor="end"
                      >
                        {tick}
                      </text>
                    )
                  })}
                  {X_TICK_FRACTIONS.map((fraction) => {
                    const x =
                      PULSE_COMPARISON_SVG.plotLeft +
                      ((fraction + 1) / 2) * PULSE_COMPARISON_SVG.plotWidth

                    return (
                      <text
                        key={`x-label-${fraction}`}
                        x={x}
                        y={
                          PULSE_COMPARISON_SVG.plotTop +
                          PULSE_COMPARISON_SVG.plotHeight +
                          22
                        }
                        textAnchor="middle"
                      >
                        {formatScaledTime(plotData.outputPulseFwhmPs, fraction)}
                      </text>
                    )
                  })}
                </g>

                <line
                  className="pulse-comparison-axis"
                  x1={PULSE_COMPARISON_SVG.plotLeft}
                  x2={
                    PULSE_COMPARISON_SVG.plotLeft +
                    PULSE_COMPARISON_SVG.plotWidth
                  }
                  y1={
                    PULSE_COMPARISON_SVG.plotTop +
                    PULSE_COMPARISON_SVG.plotHeight
                  }
                  y2={
                    PULSE_COMPARISON_SVG.plotTop +
                    PULSE_COMPARISON_SVG.plotHeight
                  }
                />
                <line
                  className="pulse-comparison-axis"
                  x1={PULSE_COMPARISON_SVG.plotLeft}
                  x2={PULSE_COMPARISON_SVG.plotLeft}
                  y1={PULSE_COMPARISON_SVG.plotTop}
                  y2={
                    PULSE_COMPARISON_SVG.plotTop +
                    PULSE_COMPARISON_SVG.plotHeight
                  }
                />
                <text
                  className="pulse-comparison-axis-label"
                  x={
                    PULSE_COMPARISON_SVG.plotLeft +
                    PULSE_COMPARISON_SVG.plotWidth / 2
                  }
                  y={390}
                  textAnchor="middle"
                >
                  Relative time t (ps)
                </text>
                <text
                  className="pulse-comparison-axis-label"
                  transform={`rotate(-90 18 ${
                    PULSE_COMPARISON_SVG.plotTop +
                    PULSE_COMPARISON_SVG.plotHeight / 2
                  })`}
                  x={18}
                  y={
                    PULSE_COMPARISON_SVG.plotTop +
                    PULSE_COMPARISON_SVG.plotHeight / 2
                  }
                  textAnchor="middle"
                >
                  Unit-peak normalized profile
                </text>

                <line
                  className="pulse-comparison-fwhm-marker pulse-comparison-fwhm-marker-input"
                  data-testid="pulse-comparison-input-fwhm-marker"
                  data-fwhm-ps={plotData.svg.inputFwhmMarker.fwhmPs}
                  data-y="0.5"
                  x1={plotData.svg.inputFwhmMarker.leftX}
                  x2={plotData.svg.inputFwhmMarker.rightX}
                  y1={plotData.svg.inputFwhmMarker.y}
                  y2={plotData.svg.inputFwhmMarker.y}
                />
                <line
                  className="pulse-comparison-fwhm-cap pulse-comparison-fwhm-cap-input"
                  x1={plotData.svg.inputFwhmMarker.leftX}
                  x2={plotData.svg.inputFwhmMarker.leftX}
                  y1={plotData.svg.inputFwhmMarker.y - 6}
                  y2={plotData.svg.inputFwhmMarker.y + 6}
                />
                <line
                  className="pulse-comparison-fwhm-cap pulse-comparison-fwhm-cap-input"
                  x1={plotData.svg.inputFwhmMarker.rightX}
                  x2={plotData.svg.inputFwhmMarker.rightX}
                  y1={plotData.svg.inputFwhmMarker.y - 6}
                  y2={plotData.svg.inputFwhmMarker.y + 6}
                />
                <line
                  className="pulse-comparison-fwhm-marker pulse-comparison-fwhm-marker-output"
                  data-testid="pulse-comparison-output-fwhm-marker"
                  data-fwhm-ps={plotData.svg.outputFwhmMarker.fwhmPs}
                  data-y="0.5"
                  x1={plotData.svg.outputFwhmMarker.leftX}
                  x2={plotData.svg.outputFwhmMarker.rightX}
                  y1={plotData.svg.outputFwhmMarker.y}
                  y2={plotData.svg.outputFwhmMarker.y}
                />
                <line
                  className="pulse-comparison-fwhm-cap pulse-comparison-fwhm-cap-output"
                  x1={plotData.svg.outputFwhmMarker.leftX}
                  x2={plotData.svg.outputFwhmMarker.leftX}
                  y1={plotData.svg.outputFwhmMarker.y - 6}
                  y2={plotData.svg.outputFwhmMarker.y + 6}
                />
                <line
                  className="pulse-comparison-fwhm-cap pulse-comparison-fwhm-cap-output"
                  x1={plotData.svg.outputFwhmMarker.rightX}
                  x2={plotData.svg.outputFwhmMarker.rightX}
                  y1={plotData.svg.outputFwhmMarker.y - 6}
                  y2={plotData.svg.outputFwhmMarker.y + 6}
                />

                <polyline
                  className="pulse-comparison-sample-line pulse-comparison-input-line"
                  points={pointsAttribute(plotData.svg.inputPoints)}
                />
                <polyline
                  className="pulse-comparison-sample-line pulse-comparison-output-line"
                  points={pointsAttribute(plotData.svg.outputPoints)}
                />
                <g aria-hidden="true">
                  {plotData.svg.inputPoints.map((point, index) => (
                    <circle
                      key={`input-${index}`}
                      className="pulse-comparison-sample-point pulse-comparison-input-point"
                      data-normalized-value={point.normalizedValue}
                      data-time-ps={point.timePs}
                      cx={point.x}
                      cy={point.y}
                      r={3}
                    />
                  ))}
                  {plotData.svg.outputPoints.map((point, index) => (
                    <circle
                      key={`output-${index}`}
                      className="pulse-comparison-sample-point pulse-comparison-output-point"
                      data-normalized-value={point.normalizedValue}
                      data-time-ps={point.timePs}
                      cx={point.x}
                      cy={point.y}
                      r={3}
                    />
                  ))}
                </g>
              </svg>
            </div>
            <figcaption>
              Frontend-generated normalized Gaussian profiles are shown on one
              relative-time axis; FWHM markers identify each reconstructed width
              at normalized profile 0.5.
            </figcaption>
          </figure>

          <ul className="pulse-comparison-legend" aria-label="Curve legend">
            <li>
              <span
                className="pulse-comparison-legend-swatch pulse-comparison-legend-input"
                aria-hidden="true"
              />
              Input Gaussian profile ({formatNumber(plotData.inputPulseFwhmPs)}{' '}
              ps FWHM)
            </li>
            <li>
              <span
                className="pulse-comparison-legend-swatch pulse-comparison-legend-output"
                aria-hidden="true"
              />
              Output Gaussian profile (
              {formatNumber(plotData.outputPulseFwhmPs)} ps FWHM)
            </li>
            <li>
              <span
                className="pulse-comparison-legend-marker"
                aria-hidden="true"
              />
              FWHM marker at normalized profile 0.5
            </li>
          </ul>

          {plotData.inputPulseFwhmPs === plotData.outputPulseFwhmPs && (
            <p className="pulse-comparison-note">
              Equal input and output FWHM values make the reconstructed curves
              coincide exactly. Both curves remain in the plot and legend so the
              supplied input/output roles are explicit.
            </p>
          )}
          {plotData.dispersionBroadeningFwhmPs === 0 && (
            <p className="pulse-comparison-note">
              The backend reports zero dispersion broadening. The displayed
              curves use the supplied input and output FWHM values directly; no
              broadening equation is recomputed or cross-checked here.
            </p>
          )}

          <p id={explanationId} className="pulse-comparison-explanation">
            Only the FWHM values and scalar facts displayed above came from the
            backend. Curve samples are generated in the frontend from the
            manifest&apos;s Gaussian input-pulse and Gaussian-broadening FWHM
            assumption. The input and output curves are independently unit-peak
            normalized; they do not encode optical power, attenuation, pulse
            energy, or physical peak reduction. Both curves are centered at
            relative t=0, so propagation and group delay are omitted. This
            first-order model is not full pulse propagation and excludes chirp,
            higher-order dispersion, nonlinearity, and polarization-mode
            dispersion (PMD). No standards conformance inference is made.
          </p>

          <details className="pulse-comparison-details">
            <summary>Show reconstructed Gaussian samples</summary>
            <p>
              These are frontend-reconstructed samples, not backend samples.
              Each profile has 65 deterministic points from -FWHM to +FWHM; the
              values are unit-peak normalized Gaussian evaluations.
            </p>
            <div className="pulse-comparison-table-wrap">
              <table>
                <caption>
                  Reconstructed Gaussian pulse profile samples (not backend
                  samples)
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Sample</th>
                    <th scope="col">Input relative time (ps)</th>
                    <th scope="col">Input normalized profile</th>
                    <th scope="col">Output relative time (ps)</th>
                    <th scope="col">Output normalized profile</th>
                  </tr>
                </thead>
                <tbody>
                  {renderSampleRows(
                    plotData.inputProfile,
                    plotData.outputProfile,
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </article>
  )
}
