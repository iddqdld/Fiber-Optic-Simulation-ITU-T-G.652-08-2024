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
  })
})
