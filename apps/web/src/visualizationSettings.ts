import type { CameraPresetId, FibreRouteStyle } from './fibreShowcase'
import type { SupportedModeId } from './modeRegime'

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
  /** Educational schematic mode shown when multimode; LP01 uses backend samples. */
  selectedSchematicMode: SupportedModeId
  bendMarkersEnabled: boolean
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
  selectedSchematicMode: 'LP01',
  bendMarkersEnabled: true,
}

export const modeDisplayThreshold = 0.01
