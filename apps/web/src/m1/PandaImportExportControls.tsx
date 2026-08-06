import { useRef, useState, type ChangeEvent } from 'react'

import { downloadFile } from '../importExport'
import type { PandaFieldController } from './pandaFieldModel'
import {
  parsePandaConfiguration,
  serializePandaConfiguration,
  serializePandaResult,
  type PandaPortableConfiguration,
} from './pandaImportExport'
import type { PandaThermalFemController } from './pandaThermalFemModel'
import type { M1WorkspaceId } from './M1WorkspaceCatalog'

type PandaImportExportControlsProps = {
  workspace: M1WorkspaceId
  pandaField: PandaFieldController
  thermalFem: PandaThermalFemController
  onImport: (
    configuration: PandaPortableConfiguration,
    filename: string,
  ) => void
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '-').slice(0, 19)
}

export function PandaImportExportControls({
  workspace,
  pandaField,
  thermalFem,
  onImport,
}: PandaImportExportControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const activeResult =
    workspace === 'panda-field' ? pandaField.result : thermalFem.result

  const exportConfiguration = () => {
    const content = serializePandaConfiguration(
      workspace,
      pandaField.values,
      pandaField.presentationMode,
      pandaField.showReferenceSpokes,
      thermalFem.controls,
    )
    downloadFile(
      `panda_config_${timestamp()}.json`,
      content,
      'application/json',
    )
  }

  const exportResult = () => {
    if (activeResult === null) return
    const content = serializePandaResult(workspace, activeResult)
    const name =
      workspace === 'panda-field'
        ? 'panda_field_result'
        : 'panda_thermal_fem_result'
    downloadFile(`${name}_${timestamp()}.json`, content, 'application/json')
  }

  const importConfiguration = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file === undefined) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = parsePandaConfiguration(String(reader.result))
      if (result.success) {
        onImport(result.configuration, file.name)
        setStatus('PANDA configuration imported.')
      } else {
        setStatus(`PANDA import failed: ${result.error}`)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <div
      className="import-export-toolbar"
      data-testid="panda-import-export-toolbar"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        aria-label="Import PANDA configuration JSON file"
        onChange={importConfiguration}
      />
      <div className="import-export-action-group">
        <button
          type="button"
          className="editor-shell-tab"
          onClick={() => {
            setStatus(null)
            fileInputRef.current?.click()
          }}
          title="Import a PANDA configuration from JSON"
        >
          Import JSON
        </button>
        <button
          type="button"
          className="editor-shell-tab"
          onClick={exportConfiguration}
          title="Export the PANDA inputs to JSON"
        >
          Export JSON
        </button>
        <button
          type="button"
          className="editor-shell-tab"
          disabled={activeResult === null}
          onClick={exportResult}
          title="Export the visible PANDA result to JSON"
        >
          Export Results
        </button>
      </div>
      {status !== null && (
        <div className="import-export-toast" role="status" aria-live="polite">
          <span className="import-export-toast-text">{status}</span>
          <button
            type="button"
            className="import-export-toast-dismiss"
            onClick={() => setStatus(null)}
            aria-label="Dismiss status message"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
