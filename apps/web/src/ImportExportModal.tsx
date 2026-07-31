import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import type {
  components,
  operations,
} from '../../../packages/shared_schemas/generated/api'
import type { FormValues } from './Level1Form'
import {
  downloadFile,
  exportMacrobendLossCsv,
  exportMetricsCsv,
  exportPowerDistanceCsv,
  exportPulseComparisonCsv,
  exportRadialIntensityCsv,
  exportSimulationResultJson,
  parseAndValidateConfiguration,
  serializeConfiguration,
} from './importExport'
import type { PowerDistanceData } from './powerDistancePlot'
import type { PulseComparisonData } from './pulseComparisonPlot'

type PreviewResult =
  operations['preview_level1_simulation']['responses'][200]['content']['application/json']

/**
 * Props interface for the Import/Export management component.
 */
export interface ImportExportModalProps {
  formValues: FormValues
  onImportConfig: (importedValues: FormValues, filename?: string) => void
  previewResult: PreviewResult | null
  powerDistanceData?: PowerDistanceData | null
  pulseData?: PulseComparisonData | null
}

/**
 * Renders actions and modal interface for portable JSON configuration
 * import/export and CSV dataset generation.
 */
export function ImportExportModal({
  formValues,
  onImportConfig,
  previewResult,
  powerDistanceData,
  pulseData,
}: ImportExportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [importStatusMessage, setImportStatusMessage] = useState<string | null>(
    null,
  )
  const [importStatusTone, setImportStatusTone] = useState<
    'success' | 'error' | null
  >(null)

  useEffect(() => {
    if (importStatusMessage !== null) {
      const dismissTimer = setTimeout(() => {
        setImportStatusMessage(null)
        setImportStatusTone(null)
      }, 4000)

      return () => clearTimeout(dismissTimer)
    }
  }, [importStatusMessage])

  useEffect(() => {
    if (!modalOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [modalOpen])

  const handleExportConfigJson = () => {
    const serializedJson = serializeConfiguration(formValues)
    const timestamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19)
    downloadFile(
      `g652_config_${timestamp}.json`,
      serializedJson,
      'application/json',
    )
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file === undefined) {
      return
    }

    const reader = new FileReader()
    reader.onload = (fileEvent) => {
      const rawText = fileEvent.target?.result as string
      const result = parseAndValidateConfiguration(rawText)
      if (result.success) {
        onImportConfig(result.formValues, file.name)
        setImportStatusMessage('Configuration imported successfully.')
        setImportStatusTone('success')
      } else {
        setImportStatusMessage(`Error importing configuration: ${result.error}`)
        setImportStatusTone('error')
      }
    }
    reader.readAsText(file)

    if (fileInputRef.current !== null) {
      fileInputRef.current.value = ''
    }
  }

  const triggerFileInput = () => {
    setImportStatusMessage(null)
    setImportStatusTone(null)
    fileInputRef.current?.click()
  }

  const handleExportResultJson = () => {
    if (previewResult === null) {
      return
    }

    const serializedJson = exportSimulationResultJson(previewResult)
    const timestamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19)
    downloadFile(
      `g652_simulation_results_${timestamp}.json`,
      serializedJson,
      'application/json',
    )
  }

  const handleExportMetricsCsv = () => {
    if (previewResult === null) {
      return
    }

    const csvContent = exportMetricsCsv(previewResult, formValues)
    const timestamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19)
    downloadFile(
      `g652_metrics_summary_${timestamp}.csv`,
      csvContent,
      'text/csv;charset=utf-8;',
    )
  }

  const handleExportPowerDistanceCsv = () => {
    if (powerDistanceData === undefined || powerDistanceData === null) {
      return
    }

    const csvContent = exportPowerDistanceCsv(powerDistanceData)
    const timestamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19)
    downloadFile(
      `g652_power_vs_distance_${timestamp}.csv`,
      csvContent,
      'text/csv;charset=utf-8;',
    )
  }

  const handleExportRadialIntensityCsv = () => {
    if (previewResult === null || previewResult.mode_profile === null) {
      return
    }

    const csvContent = exportRadialIntensityCsv(previewResult.mode_profile)
    const timestamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19)
    downloadFile(
      `g652_mode_profile_${timestamp}.csv`,
      csvContent,
      'text/csv;charset=utf-8;',
    )
  }

  const handleExportPulseCsv = () => {
    if (pulseData === undefined || pulseData === null) {
      return
    }

    const csvContent = exportPulseComparisonCsv(pulseData)
    const timestamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19)
    downloadFile(
      `g652_pulse_broadening_${timestamp}.csv`,
      csvContent,
      'text/csv;charset=utf-8;',
    )
  }

  const handleExportMacrobendCsv = () => {
    const rawResult = previewResult as Record<string, unknown> | null
    const macrobendLoss = rawResult?.macrobend_loss as
      components['schemas']['MacrobendLossResult'] | null | undefined

    if (macrobendLoss === undefined || macrobendLoss === null) {
      return
    }

    const csvContent = exportMacrobendLossCsv(macrobendLoss)
    const timestamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19)
    downloadFile(
      `g652_macrobend_loss_${timestamp}.csv`,
      csvContent,
      'text/csv;charset=utf-8;',
    )
  }

  return (
    <div className="import-export-toolbar" data-testid="import-export-toolbar">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        data-testid="import-config-input"
        aria-label="Import configuration JSON file"
        onChange={handleFileChange}
      />

      <div className="import-export-action-group">
        <button
          type="button"
          className="editor-shell-tab"
          onClick={triggerFileInput}
          title="Import configuration JSON file"
        >
          Import JSON
        </button>

        <button
          type="button"
          className="editor-shell-tab"
          onClick={handleExportConfigJson}
          title="Export current parameters to JSON"
        >
          Export JSON
        </button>

        <button
          type="button"
          className="editor-shell-tab"
          onClick={() => setModalOpen(true)}
          title="Export simulation results to JSON or CSV"
        >
          Export Results
        </button>
      </div>

      {importStatusMessage !== null && (
        <div
          className="import-export-toast"
          data-tone={importStatusTone}
          role="status"
          aria-live="polite"
        >
          <span className="import-export-toast-badge" aria-hidden="true">
            {importStatusTone === 'success' ? '✓' : '⚠️'}
          </span>
          <span className="import-export-toast-text">
            {importStatusMessage}
          </span>
          <button
            type="button"
            className="import-export-toast-dismiss"
            onClick={() => setImportStatusMessage(null)}
            aria-label="Dismiss status message"
          >
            ✕
          </button>
        </div>
      )}

      {modalOpen && (
        <div
          className="import-export-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
        >
          <div className="import-export-modal-content">
            <header className="import-export-modal-header">
              <h3 id="export-modal-title">Export Simulation Results</h3>
              <button
                type="button"
                className="import-export-modal-close"
                onClick={() => setModalOpen(false)}
                aria-label="Close export dialog"
              >
                ✕
              </button>
            </header>

            <div className="import-export-modal-body">
              {previewResult === null ? (
                <p className="import-export-modal-empty">
                  No simulation results available yet. Run a simulation preview
                  first.
                </p>
              ) : (
                <div className="import-export-options-grid">
                  <div className="import-export-option-card">
                    <h4>Metrics & Summary</h4>
                    <p>
                      Calculated parameters, V-number, loss, and standards
                      compliance.
                    </p>
                    <div className="import-export-card-actions">
                      <button
                        type="button"
                        onClick={handleExportMetricsCsv}
                        className="editor-shell-tab"
                      >
                        Download CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleExportResultJson}
                        className="editor-shell-tab"
                      >
                        Download Full JSON
                      </button>
                    </div>
                  </div>

                  <div className="import-export-option-card">
                    <h4>Power vs. Distance Curve</h4>
                    <p>Sampled power propagation values along fiber length.</p>
                    <button
                      type="button"
                      onClick={handleExportPowerDistanceCsv}
                      disabled={
                        powerDistanceData === undefined ||
                        powerDistanceData === null
                      }
                      className="editor-shell-tab"
                    >
                      Download CSV
                    </button>
                  </div>

                  <div className="import-export-option-card">
                    <h4>Mode Field Intensity</h4>
                    <p>
                      Transverse radial electric field and intensity profiles.
                    </p>
                    <button
                      type="button"
                      onClick={handleExportRadialIntensityCsv}
                      disabled={previewResult.mode_profile === null}
                      className="editor-shell-tab"
                    >
                      Download CSV
                    </button>
                  </div>

                  <div className="import-export-option-card">
                    <h4>Pulse Broadening</h4>
                    <p>Input and output Gaussian pulse shapes over time.</p>
                    <button
                      type="button"
                      onClick={handleExportPulseCsv}
                      disabled={pulseData === undefined || pulseData === null}
                      className="editor-shell-tab"
                    >
                      Download CSV
                    </button>
                  </div>

                  {(previewResult as Record<string, unknown> | null)
                    ?.macrobend_loss !== undefined &&
                    (previewResult as Record<string, unknown> | null)
                      ?.macrobend_loss !== null && (
                      <div className="import-export-option-card">
                        <h4>Macrobend Loss</h4>
                        <p>
                          Configured bend parameters and calculated bending
                          attenuation.
                        </p>
                        <button
                          type="button"
                          onClick={handleExportMacrobendCsv}
                          className="editor-shell-tab"
                        >
                          Download CSV
                        </button>
                      </div>
                    )}
                </div>
              )}
            </div>

            <footer className="import-export-modal-footer">
              <button
                type="button"
                className="editor-shell-tab"
                onClick={() => setModalOpen(false)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
