export type VisualizationSettings = {
  visualLength: number
  rayViewEnabled: boolean
  incidenceAngleDeg: number
  modeViewEnabled: boolean
  pulseAnimationEnabled: boolean
}

export const defaultVisualizationSettings: VisualizationSettings = {
  visualLength: 8,
  rayViewEnabled: true,
  incidenceAngleDeg: 86,
  modeViewEnabled: true,
  pulseAnimationEnabled: true,
}

export const modeDisplayThreshold = 0.01
