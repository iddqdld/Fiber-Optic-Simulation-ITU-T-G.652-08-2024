export type M1WorkspaceId = 'panda-field' | 'fem-mesh'

export function getM1WorkspaceLabel(workspace: M1WorkspaceId): string {
  return workspace === 'panda-field' ? 'PANDA field' : 'FEM mesh'
}
