import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { GraphWorkspace } from './GraphWorkspace'
import type { GraphWorkspaceId } from './graphWorkspace'

vi.mock('./RadialIntensityPlot', () => ({
  RadialIntensityPlot: () => <p>Radial plot mounted</p>,
}))

vi.mock('./PowerDistancePlot', () => ({
  PowerDistancePlot: () => <p>Power plot mounted</p>,
}))

vi.mock('./PulseComparisonPlot', () => ({
  PulseComparisonPlot: () => <p>Pulse plot mounted</p>,
}))

afterEach(cleanup)

function Harness() {
  const [activeGraph, setActiveGraph] = useState<GraphWorkspaceId>(
    'lp01-radial-intensity',
  )

  return (
    <GraphWorkspace
      activeGraph={activeGraph}
      onActiveGraphChange={setActiveGraph}
      modeProfile={null}
      attenuation={null}
      pulseComparison={null}
    />
  )
}

describe('GraphWorkspace', () => {
  test('renders one selected graph at a time', () => {
    render(<Harness />)

    expect(screen.getByText('Radial plot mounted')).toBeVisible()
    expect(screen.queryByText('Power plot mounted')).not.toBeInTheDocument()
    expect(screen.queryByText('Pulse plot mounted')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Power / distance' }))
    expect(screen.getByText('Power plot mounted')).toBeVisible()
    expect(screen.queryByText('Radial plot mounted')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Pulse comparison' }))
    expect(screen.getByText('Pulse plot mounted')).toBeVisible()
    expect(screen.queryByText('Power plot mounted')).not.toBeInTheDocument()
  })

  test('exposes selected graph tab and panel semantics', () => {
    render(<Harness />)

    const activeTab = screen.getByRole('tab', { name: 'LP01 intensity' })
    const panel = screen.getByRole('tabpanel')

    expect(activeTab).toHaveAttribute('aria-selected', 'true')
    expect(panel).toHaveAttribute('aria-labelledby', activeTab.id)
    expect(panel.id).toBe(activeTab.getAttribute('aria-controls'))
  })

  test('moves graph selection with arrow, Home, and End keys', () => {
    render(<Harness />)

    const radial = screen.getByRole('tab', { name: 'LP01 intensity' })
    fireEvent.keyDown(radial, { key: 'ArrowRight' })
    expect(
      screen.getByRole('tab', { name: 'Power / distance' }),
    ).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Power / distance' }), {
      key: 'End',
    })
    expect(
      screen.getByRole('tab', { name: 'Pulse comparison' }),
    ).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Pulse comparison' }), {
      key: 'Home',
    })
    expect(radial).toHaveAttribute('aria-selected', 'true')
  })
})
