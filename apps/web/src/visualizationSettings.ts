import type { CameraPresetId, FibreRouteStyle } from './fibreShowcase'

export type VisualizationSettings = {
  visualLength: number
  rayViewEnabled: boolean
  incidenceAngleDeg: number
  modeViewEnabled: boolean
  pulseAnimationEnabled: boolean
  fibreRoute: FibreRouteStyle
  cameraPreset: CameraPresetId | null
  claddingVisible: boolean
  scaleMarkersEnabled: boolean
  powerIndicatorsEnabled: boolean
  pulseMarkersEnabled: boolean
}

export const defaultVisualizationSettings: VisualizationSettings = {
  visualLength: 8,
  rayViewEnabled: true,
  incidenceAngleDeg: 86,
  modeViewEnabled: true,
  pulseAnimationEnabled: true,
  fibreRoute: 'straight',
  cameraPreset: 'perspective',
  claddingVisible: true,
  scaleMarkersEnabled: true,
  powerIndicatorsEnabled: true,
  pulseMarkersEnabled: true,
}

export const modeDisplayThreshold = 0.01
