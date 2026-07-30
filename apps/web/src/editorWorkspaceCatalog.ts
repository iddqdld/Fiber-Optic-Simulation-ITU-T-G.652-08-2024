export type WorkspaceId =
  | 'scene'
  | 'graphs'
  | 'standards'
  | 'compare'
  | 'sweep'
  | 'panda-field'
  | 'fem-mesh'

export type WorkspaceTab = {
  id: WorkspaceId
  label: string
}

export type ModuleId = 'step-1' | 'panda'

export type EditorModule = {
  id: ModuleId
  label: string
  defaultWorkspace: WorkspaceId
}

export const editorModules: readonly EditorModule[] = [
  { id: 'step-1', label: 'G.652', defaultWorkspace: 'scene' },
  { id: 'panda', label: 'PANDA', defaultWorkspace: 'panda-field' },
]

export const workspaceTabsByModule: Record<ModuleId, readonly WorkspaceTab[]> =
  {
    'step-1': [
      { id: 'scene', label: '3D scene' },
      { id: 'graphs', label: 'Graphs' },
      { id: 'standards', label: 'Standards' },
      { id: 'compare', label: 'Compare' },
      { id: 'sweep', label: 'Sweep' },
    ],
    panda: [
      { id: 'panda-field', label: 'Field map' },
      { id: 'fem-mesh', label: 'FEM mesh' },
    ],
  }

export const workspaceTabs: readonly WorkspaceTab[] = [
  ...workspaceTabsByModule['step-1'],
  ...workspaceTabsByModule.panda,
]

export const pandaWorkspaceIds: readonly WorkspaceId[] = [
  'panda-field',
  'fem-mesh',
]
