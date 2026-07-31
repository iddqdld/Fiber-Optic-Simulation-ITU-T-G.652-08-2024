import { useRef, type KeyboardEvent } from 'react'

import {
  editorModules,
  pandaWorkspaceIds,
  workspaceTabsByModule,
  type ModuleId,
  type WorkspaceId,
} from './editorWorkspaceCatalog'

type EditorNavigationProps = {
  shellId: string
  activeWorkspace: WorkspaceId
  onWorkspaceChange: (workspace: WorkspaceId) => void
}

export function EditorNavigation({
  shellId,
  activeWorkspace,
  onWorkspaceChange,
}: EditorNavigationProps) {
  const activeModule: ModuleId = pandaWorkspaceIds.includes(activeWorkspace)
    ? 'panda'
    : 'step-1'
  const activeWorkspaceTabs = workspaceTabsByModule[activeModule]
  const tabRefs = useRef<Record<ModuleId, Array<HTMLButtonElement | null>>>({
    'step-1': [],
    panda: [],
  })

  const handleWorkspaceKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    workspaceId: WorkspaceId,
  ) => {
    const currentIndex = activeWorkspaceTabs.findIndex(
      (tab) => tab.id === workspaceId,
    )
    let nextIndex: number

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % activeWorkspaceTabs.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex =
        (currentIndex - 1 + activeWorkspaceTabs.length) %
        activeWorkspaceTabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = activeWorkspaceTabs.length - 1
    } else {
      return
    }

    event.preventDefault()
    onWorkspaceChange(activeWorkspaceTabs[nextIndex].id)
    tabRefs.current[activeModule][nextIndex]?.focus()
  }

  const activeModuleLabel = editorModules.find(
    (module) => module.id === activeModule,
  )?.label

  return (
    <nav className="editor-shell-navigation" aria-label="Simulation navigation">
      <div
        className="editor-shell-module-nav"
        role="group"
        aria-label="Simulation steps"
      >
        {editorModules.map((module) => {
          const selected = activeModule === module.id

          return (
            <button
              key={module.id}
              className="editor-shell-module-button"
              type="button"
              aria-pressed={selected}
              onClick={() => onWorkspaceChange(module.defaultWorkspace)}
            >
              {module.label}
            </button>
          )
        })}
      </div>

      <div
        className="editor-shell-tabs"
        role="tablist"
        aria-label={`${activeModuleLabel} workspaces`}
      >
        {activeWorkspaceTabs.map((tab, index) => {
          const tabId = `${shellId}-tab-${tab.id}`
          const panelId = `${shellId}-panel-${tab.id}`
          const selected = activeWorkspace === tab.id

          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[activeModule][index] = element
              }}
              id={tabId}
              className="editor-shell-tab"
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onWorkspaceChange(tab.id)}
              onKeyDown={(event) => handleWorkspaceKeyDown(event, tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
