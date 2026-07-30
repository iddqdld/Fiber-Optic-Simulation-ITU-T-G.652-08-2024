import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { M1Inspector } from './M1Inspector'
import { M1Results } from './M1Results'
import { M1Workspace } from './M1Workspace'

afterEach(() => {
  cleanup()
})

describe('M1 foundation workspaces', () => {
  test('keeps the PANDA view 2D and uncalculated', () => {
    const { container } = render(
      <>
        <M1Inspector workspace="panda-field" />
        <M1Workspace workspace="panda-field" />
        <M1Results workspace="panda-field" />
      </>,
    )

    expect(screen.getByRole('heading', { name: 'PANDA field' })).toBeVisible()
    expect(
      screen.getAllByText(/normalized qualitative deviatoric kernel/),
    ).toHaveLength(2)
    expect(
      screen.getByText(/No field values are being displayed/),
    ).toBeVisible()
    expect(screen.getByText('Calculation')).toBeVisible()
    expect(screen.getAllByText('Not run')).toHaveLength(1)
    expect(screen.getAllByText('Not evaluated')).toHaveLength(2)
    expect(container.querySelector('canvas')).not.toBeInTheDocument()
    expect(container.querySelector('input')).not.toBeInTheDocument()
  })

  test('keeps the FEM view labelled as a 2D mesh foundation', () => {
    const { container } = render(<M1Workspace workspace="fem-mesh" />)

    expect(screen.getByRole('heading', { name: 'FEM mesh' })).toBeVisible()
    expect(screen.getByText(/Figure 9\.1/)).toBeVisible()
    expect(screen.getByText(/No mesh or validation values/)).toBeVisible()
    expect(
      container.querySelector('[data-dimensionality="2D"]'),
    ).toBeInTheDocument()
    expect(container.querySelector('canvas')).not.toBeInTheDocument()
  })
})
