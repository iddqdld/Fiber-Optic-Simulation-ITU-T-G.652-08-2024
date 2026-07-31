import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { EditorNavigation } from './EditorNavigation'
import { workspaceTabs, type WorkspaceId } from './editorWorkspaceCatalog'

export type { WorkspaceId } from './editorWorkspaceCatalog'

export type PreviewStateTone =
  'neutral' | 'info' | 'success' | 'warning' | 'error'

export type EditorShellProps = {
  activeWorkspace: WorkspaceId
  onWorkspaceChange: (workspace: WorkspaceId) => void
  previewStateLabel: string
  previewStateTone?: PreviewStateTone
  backendLabel: string
  backendHealthy: boolean
  warningCount: number
  resultDrawerOpen: boolean
  onResultDrawerToggle: () => void
  modelLabel?: ReactNode
  inspector?: ReactNode
  workspace?: ReactNode
  resultDrawer?: ReactNode
  importExportControls?: ReactNode
}

function warningLabel(count: number) {
  return `${count} warning${count === 1 ? '' : 's'}`
}

export function EditorShell({
  activeWorkspace,
  onWorkspaceChange,
  previewStateLabel,
  previewStateTone = 'neutral',
  backendLabel,
  backendHealthy,
  warningCount,
  resultDrawerOpen,
  onResultDrawerToggle,
  modelLabel,
  inspector,
  workspace,
  resultDrawer,
  importExportControls,
}: EditorShellProps) {
  const shellId = `editor-shell-${useId().replaceAll(':', '')}`
  const inspectorId = `${shellId}-inspector`
  const resultDrawerId = `${shellId}-result-drawer`
  const resultDrawerTriggerRef = useRef<HTMLButtonElement>(null)
  const resultDrawerCloseRef = useRef<HTMLButtonElement>(null)
  const resultDrawerWasOpen = useRef(false)
  const mobileInspectorTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileInspectorCloseRef = useRef<HTMLButtonElement>(null)
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false)

  useEffect(() => {
    if (resultDrawerOpen) {
      resultDrawerCloseRef.current?.focus()
    } else if (resultDrawerWasOpen.current) {
      resultDrawerTriggerRef.current?.focus()
    }

    resultDrawerWasOpen.current = resultDrawerOpen
  }, [resultDrawerOpen])

  useEffect(() => {
    if (mobileInspectorOpen) {
      mobileInspectorCloseRef.current?.focus()
    }
  }, [mobileInspectorOpen])

  const closeMobileInspector = () => {
    setMobileInspectorOpen(false)
    mobileInspectorTriggerRef.current?.focus()
  }

  const openMobileInspector = () => {
    if (resultDrawerOpen && resultDrawer !== undefined) {
      onResultDrawerToggle()
    }
    setMobileInspectorOpen(true)
  }

  const toggleResultDrawer = () => {
    if (!resultDrawerOpen && mobileInspectorOpen) {
      setMobileInspectorOpen(false)
    }
    onResultDrawerToggle()
  }

  const handleShellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key === 'Escape' &&
      resultDrawerOpen &&
      resultDrawer !== undefined
    ) {
      event.preventDefault()
      onResultDrawerToggle()
    }
  }

  const handleInspectorKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && mobileInspectorOpen) {
      event.preventDefault()
      event.stopPropagation()
      closeMobileInspector()
    }
  }

  return (
    <div
      className="editor-shell"
      data-mobile-inspector-open={mobileInspectorOpen}
      onKeyDown={handleShellKeyDown}
    >
      <header className="editor-shell-app-bar">
        <div className="editor-shell-identity">
          <h1>Fibre Simulator</h1>
          {modelLabel !== undefined && modelLabel !== null && (
            <p className="editor-shell-model-label">{modelLabel}</p>
          )}
        </div>

        <EditorNavigation
          shellId={shellId}
          activeWorkspace={activeWorkspace}
          onWorkspaceChange={onWorkspaceChange}
        />

        <div className="editor-shell-actions">
          <p
            className="editor-shell-live-status"
            role="status"
            aria-live="polite"
          >
            <span data-tone={previewStateTone}>{previewStateLabel}</span>
            <span aria-hidden="true"> · </span>
            <span data-healthy={backendHealthy}>{backendLabel}</span>
          </p>

          {importExportControls !== undefined &&
            importExportControls !== null && (
              <div className="editor-shell-import-export">
                {importExportControls}
              </div>
            )}

          <button
            ref={mobileInspectorTriggerRef}
            className="editor-shell-inspector-toggle"
            type="button"
            aria-expanded={mobileInspectorOpen}
            aria-controls={inspectorId}
            onClick={openMobileInspector}
          >
            Open inspector
          </button>

          {resultDrawer !== undefined && (
            <button
              ref={resultDrawerTriggerRef}
              className="editor-shell-results-toggle"
              type="button"
              aria-expanded={resultDrawerOpen}
              aria-controls={resultDrawerId}
              aria-label={`Results, ${warningLabel(warningCount)}`}
              onClick={toggleResultDrawer}
            >
              <span aria-hidden="true">Results</span>{' '}
              <span aria-hidden="true">{warningCount}</span>
            </button>
          )}
        </div>
      </header>

      <div className="editor-shell-body">
        <aside
          id={inspectorId}
          className="editor-shell-inspector"
          aria-label="Inspector"
          data-mobile-open={mobileInspectorOpen}
          onKeyDown={handleInspectorKeyDown}
        >
          <header className="editor-shell-inspector-header">
            <h2>Inspector</h2>
            <button
              ref={mobileInspectorCloseRef}
              className="editor-shell-inspector-close"
              type="button"
              onClick={closeMobileInspector}
            >
              Close inspector
            </button>
          </header>
          {inspector}
        </aside>

        <main className="editor-shell-workspace">
          {workspaceTabs.map((tab) => {
            const tabId = `${shellId}-tab-${tab.id}`
            const panelId = `${shellId}-panel-${tab.id}`
            const selected = activeWorkspace === tab.id

            return (
              <section
                key={tab.id}
                id={panelId}
                className="editor-shell-workspace-panel"
                role="tabpanel"
                aria-labelledby={tabId}
                tabIndex={0}
                hidden={!selected}
              >
                {selected && workspace}
              </section>
            )
          })}
        </main>

        {resultDrawer !== undefined && resultDrawerOpen && (
          <aside
            id={resultDrawerId}
            className="editor-shell-result-drawer"
            aria-label="Result drawer"
          >
            <header className="editor-shell-result-drawer-header">
              <h2>Results</h2>
              <button
                ref={resultDrawerCloseRef}
                className="editor-shell-result-drawer-close"
                type="button"
                onClick={toggleResultDrawer}
              >
                Close result drawer
              </button>
            </header>
            {resultDrawer}
          </aside>
        )}
      </div>

      <footer
        className="editor-shell-status-bar"
        aria-label="Editor status bar"
      >
        <dl>
          <div>
            <dt>Preview</dt>
            <dd data-tone={previewStateTone}>{previewStateLabel}</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd data-healthy={backendHealthy}>{backendLabel}</dd>
          </div>
          <div>
            <dt>Warnings</dt>
            <dd>{warningCount}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{modelLabel ?? 'Awaiting preview'}</dd>
          </div>
          <div>
            <dt>Units</dt>
            <dd>Values use stated units</dd>
          </div>
        </dl>
      </footer>
    </div>
  )
}
