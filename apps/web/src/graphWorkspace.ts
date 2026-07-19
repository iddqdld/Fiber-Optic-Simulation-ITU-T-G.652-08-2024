export type GraphWorkspaceId =
  'lp01-radial-intensity' | 'power-vs-distance' | 'pulse-comparison'

type GraphDefinition = {
  id: GraphWorkspaceId
  label: string
  description: string
}

export const graphDefinitions: readonly GraphDefinition[] = [
  {
    id: 'lp01-radial-intensity',
    label: 'LP01 intensity',
    description: 'Backend normalized radial mode-profile samples.',
  },
  {
    id: 'power-vs-distance',
    label: 'Power / distance',
    description: 'Exact backend attenuation samples over the fibre section.',
  },
  {
    id: 'pulse-comparison',
    label: 'Pulse comparison',
    description: 'Input and broadened output Gaussian FWHM profiles.',
  },
]
