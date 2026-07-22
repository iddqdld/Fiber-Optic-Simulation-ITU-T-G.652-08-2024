import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { EditorShell, type WorkspaceId } from './EditorShell'

afterEach(() => {
  cleanup()
})

type HarnessProps = {
  onWorkspaceChange?: (workspace: WorkspaceId) => void
  onResultDrawerToggle?: () => void
  includeWorkspace?: boolean
}

function Harness({
  onWorkspaceChange,
  onResultDrawerToggle,
  includeWorkspace = true,
}: HarnessProps) {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('scene')
  const [resultDrawerOpen, setResultDrawerOpen] = useState(false)

  const handleWorkspaceChange = (workspace: WorkspaceId) => {
    setActiveWorkspace(workspace)
    onWorkspaceChange?.(workspace)
  }

  const handleResultDrawerToggle = () => {
    setResultDrawerOpen((open) => !open)
    onResultDrawerToggle?.()
  }

  return (
    <EditorShell
      activeWorkspace={activeWorkspace}
      onWorkspaceChange={handleWorkspaceChange}
      previewStateLabel="Preview ready"
      previewStateTone="success"
      backendLabel="Backend available"
      backendHealthy={true}
      warningCount={3}
      modelLabel="G.652.D · 1.0.0"
      resultDrawerOpen={resultDrawerOpen}
      onResultDrawerToggle={handleResultDrawerToggle}
      inspector={<p>Inspector slot</p>}
      workspace={includeWorkspace ? <p>Workspace slot</p> : undefined}
      resultDrawer={<p>Result drawer slot</p>}
    />
  )
}

describe('EditorShell', () => {
  test('renders semantic editor regions and associated workspace tabs', () => {
    render(<Harness />)

    expect(
      screen.getByRole('heading', { name: 'Fibre Simulator', level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: 'Inspector' }),
    ).toBeInTheDocument()

    const tablist = screen.getByRole('tablist', { name: 'Workspace' })
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Scene',
      'Graphs',
      'Standards',
      'Compare',
      'Sweep',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    expect(tabs[4]).not.toBeDisabled()

    const panel = screen.getByRole('tabpanel')
    expect(tablist).toContainElement(tabs[0])
    expect(panel).toHaveAttribute('id', tabs[0].getAttribute('aria-controls'))
    expect(panel).toHaveAttribute('aria-labelledby', tabs[0].id)
    expect(screen.getByText('Inspector slot')).toBeInTheDocument()
    expect(screen.getByText('Workspace slot')).toBeInTheDocument()
  })

  test('moves the roving tab with arrows, Home, and End and invokes the callback', () => {
    const onWorkspaceChange = vi.fn()
    render(<Harness onWorkspaceChange={onWorkspaceChange} />)

    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(onWorkspaceChange).toHaveBeenLastCalledWith('graphs')
    expect(screen.getByRole('tab', { name: 'Graphs' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Graphs' })).toHaveAttribute(
      'tabindex',
      '0',
    )

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Graphs' }), {
      key: 'ArrowLeft',
    })
    expect(onWorkspaceChange).toHaveBeenLastCalledWith('scene')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Scene' }), {
      key: 'End',
    })
    expect(onWorkspaceChange).toHaveBeenLastCalledWith('sweep')
    expect(screen.getByRole('tab', { name: 'Sweep' })).toHaveFocus()

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sweep' }), {
      key: 'Home',
    })
    expect(onWorkspaceChange).toHaveBeenLastCalledWith('scene')
    expect(screen.getByRole('tab', { name: 'Scene' })).toHaveFocus()
  })

  test('calls the workspace callback when a tab is selected', () => {
    const onWorkspaceChange = vi.fn()
    render(<Harness onWorkspaceChange={onWorkspaceChange} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Standards' }))

    expect(onWorkspaceChange).toHaveBeenCalledWith('standards')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      screen.getByRole('tab', { name: 'Standards' }).id,
    )
  })

  test('renders the supplied Compare workspace without a shell placeholder', () => {
    const onWorkspaceChange = vi.fn()
    render(<Harness onWorkspaceChange={onWorkspaceChange} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Compare' }))

    expect(onWorkspaceChange).toHaveBeenCalledWith('compare')
    expect(screen.getByText('Workspace slot')).toBeInTheDocument()
    expect(
      screen.queryByText('Compare workspace is not available yet.'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Compare' })).not.toBeDisabled()
  })

  test('renders the supplied Sweep workspace', () => {
    const onWorkspaceChange = vi.fn()
    render(<Harness onWorkspaceChange={onWorkspaceChange} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Sweep' }))

    expect(onWorkspaceChange).toHaveBeenCalledWith('sweep')
    expect(screen.getByText('Workspace slot')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sweep' })).not.toBeDisabled()
  })

  test('exposes preview, backend, and warning status information', () => {
    render(<Harness />)

    const liveStatus = screen.getByRole('status')

    expect(within(liveStatus).getByText('Preview ready')).toHaveAttribute(
      'data-tone',
      'success',
    )
    expect(within(liveStatus).getByText('Backend available')).toHaveAttribute(
      'data-healthy',
      'true',
    )
    expect(
      screen.getByRole('button', { name: 'Results, 3 warnings' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('3')).toHaveLength(2)
  })

  test('opens the result drawer, handles Escape, and restores trigger focus', () => {
    const onResultDrawerToggle = vi.fn()
    render(<Harness onResultDrawerToggle={onResultDrawerToggle} />)

    const trigger = screen.getByRole('button', {
      name: 'Results, 3 warnings',
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    expect(onResultDrawerToggle).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const drawer = screen.getByRole('complementary', {
      name: 'Result drawer',
    })
    expect(drawer).toHaveAttribute('id', trigger.getAttribute('aria-controls'))
    expect(
      screen.getByRole('button', { name: 'Close result drawer' }),
    ).toHaveFocus()

    fireEvent.keyDown(drawer, { key: 'Escape' })

    expect(onResultDrawerToggle).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByRole('complementary', { name: 'Result drawer' }),
    ).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  test('opens and closes the mobile inspector without changing workspace', () => {
    const onWorkspaceChange = vi.fn()
    render(<Harness onWorkspaceChange={onWorkspaceChange} />)

    const openInspector = screen.getByRole('button', { name: 'Open inspector' })
    const closeInspector = screen.getByRole('button', {
      name: 'Close inspector',
    })

    expect(openInspector).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(openInspector)

    expect(openInspector).toHaveAttribute('aria-expanded', 'true')
    expect(closeInspector).toHaveFocus()
    expect(onWorkspaceChange).not.toHaveBeenCalled()

    fireEvent.click(closeInspector)

    expect(openInspector).toHaveAttribute('aria-expanded', 'false')
    expect(openInspector).toHaveFocus()
    expect(onWorkspaceChange).not.toHaveBeenCalled()
  })
})
