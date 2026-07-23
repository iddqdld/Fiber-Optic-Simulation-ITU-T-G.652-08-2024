import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { VisualizationInspector } from './VisualizationInspector'
import {
  defaultVisualizationSettings,
  type VisualizationSettings,
} from './visualizationSettings'

afterEach(cleanup)

function Harness({
  onChange = () => undefined,
}: {
  onChange?: (settings: VisualizationSettings) => void
}) {
  const [settings, setSettings] = useState(defaultVisualizationSettings)

  return (
    <VisualizationInspector
      settings={settings}
      rayGuidance={{
        criticalAngleDeg: 85.27298324998428,
        modelId: 'ideal_circular_step_index_guidance',
        modelVersion: '1.0.0',
      }}
      onChange={(next) => {
        setSettings(next)
        onChange(next)
      }}
    />
  )
}

describe('VisualizationInspector', () => {
  test('exposes display-only layer controls and read-only threshold', () => {
    render(<Harness />)

    expect(screen.getByLabelText('Educational ray')).toBeChecked()
    expect(screen.getByLabelText('Approximate LP01 field')).toBeChecked()
    expect(screen.getByLabelText('Scaled pulse animation')).toBeChecked()
    expect(screen.getByLabelText('Cladding shell')).toBeChecked()
    expect(screen.getByLabelText('Scale markers')).toBeChecked()
    expect(screen.getByLabelText('Spatial power indicators')).toBeChecked()
    expect(screen.getByLabelText('Spatial pulse markers')).toBeChecked()
    expect(screen.getByLabelText('Path style')).toHaveValue('straight')
    expect(screen.getByText('≥ 0.01 normalized intensity')).toBeVisible()
    expect(
      screen.queryByRole('spinbutton', { name: /threshold/i }),
    ).not.toBeInTheDocument()
  })

  test('updates visibility, ranges, and exact critical boundary locally', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/Displayed fibre length/), {
      target: { value: '11' },
    })
    expect(screen.getByText('11 model units')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Critical boundary' }))
    expect(screen.getByLabelText(/Incidence angle/)).toHaveValue(
      '85.27298324998428',
    )

    fireEvent.click(screen.getByLabelText('Educational ray'))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ rayViewEnabled: false }),
    )

    fireEvent.change(screen.getByLabelText('Path style'), {
      target: { value: 'gentle_arc' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ fibreRoute: 'gentle_arc' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Side' }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cameraPreset: 'side' }),
    )
  })

  test('shows a custom camera without an active preset and restores a preset on selection', () => {
    const onChange = vi.fn()
    render(
      <VisualizationInspector
        settings={{ ...defaultVisualizationSettings, cameraPreset: null }}
        rayGuidance={null}
        onChange={onChange}
      />,
    )

    expect(screen.getByText('Straight · Custom')).toBeVisible()
    for (const option of ['Perspective', 'Side', 'End-on', 'Top']) {
      expect(screen.getByRole('button', { name: option })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    }

    fireEvent.click(screen.getByRole('button', { name: 'Top' }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cameraPreset: 'top' }),
    )
  })
})
