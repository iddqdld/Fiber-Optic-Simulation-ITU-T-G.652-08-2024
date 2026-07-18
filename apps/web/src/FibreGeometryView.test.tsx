import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    frameloop,
    role,
    'aria-label': ariaLabel,
  }: {
    frameloop?: string
    role?: string
    'aria-label'?: string
    children?: ReactNode
  }) => (
    <div
      data-testid="fibre-canvas"
      data-frameloop={frameloop}
      role={role}
      aria-label={ariaLabel}
    />
  ),
  useThree: vi.fn(),
}))

import {
  FibreGeometryScene,
  FibreGeometryView,
  type RayGuidance,
} from './FibreGeometryView'

type SceneElementProps = {
  args?: unknown[]
  color?: string
  children?: ReactNode
  depthWrite?: boolean
  name?: string
  opacity?: number
  position?: unknown
  rotation?: unknown
  toneMapped?: boolean
  transparent?: boolean
}

function findSceneElement(
  node: ReactNode,
  name: string,
): ReactElement<SceneElementProps> {
  if (!isValidElement<SceneElementProps>(node)) {
    throw new Error(`Scene element ${name} was not found`)
  }

  if (node.props.name === name) {
    return node
  }

  if (typeof node.type === 'function') {
    const rendered = (
      node.type as unknown as (props: SceneElementProps) => ReactNode
    )(node.props)

    return findSceneElement(rendered, name)
  }

  for (const child of Children.toArray(node.props.children)) {
    try {
      return findSceneElement(child, name)
    } catch {
      continue
    }
  }

  throw new Error(`Scene element ${name} was not found`)
}

function sceneElements(
  coreRadiusUm: number | null,
  visualLength: number,
  options: {
    rayGuidance?: RayGuidance | null
    incidenceAngleDeg?: number
    rayViewEnabled?: boolean
  } = {},
) {
  const scene = FibreGeometryScene({
    coreRadiusUm,
    visualLengthModelUnits: visualLength,
    ...options,
  })

  return {
    scene,
    coreGeometry: findSceneElement(scene, 'solid-core-geometry'),
    coreMaterial: findSceneElement(scene, 'solid-core-material'),
    claddingGeometry: findSceneElement(scene, 'illustrative-cladding-geometry'),
    claddingMaterial: findSceneElement(scene, 'illustrative-cladding-material'),
  }
}

afterEach(() => {
  cleanup()
})

describe('FibreGeometryScene', () => {
  test('describes an opaque core inside a translucent illustrative cladding shell', () => {
    const { coreGeometry, coreMaterial, claddingGeometry, claddingMaterial } =
      sceneElements(4, 8)

    expect(coreGeometry.props).toMatchObject({
      args: [0.4, 0.4, 8, 48],
    })
    expect(claddingGeometry.props).toMatchObject({
      args: [0.85, 0.85, 8, 48],
    })
    expect(coreMaterial.props).not.toHaveProperty('transparent')
    expect(coreMaterial.props).not.toHaveProperty('opacity')
    expect(claddingMaterial.props).toMatchObject({
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    })
  })

  test('makes the core translucent and renders each educational path state', () => {
    const guidance: RayGuidance = {
      criticalAngleDeg: 80,
      modelId: 'ideal-circular-step-index-guidance',
      modelVersion: '1.0.0',
    }
    const tir = sceneElements(4, 8, {
      rayGuidance: guidance,
      incidenceAngleDeg: 86,
      rayViewEnabled: true,
    })
    const critical = sceneElements(4, 8, {
      rayGuidance: guidance,
      incidenceAngleDeg: 80,
      rayViewEnabled: true,
    })
    const transmission = sceneElements(4, 8, {
      rayGuidance: guidance,
      incidenceAngleDeg: 70,
      rayViewEnabled: true,
    })

    expect(tir.coreMaterial.props).toMatchObject({
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
    expect(findSceneElement(tir.scene, 'educational-ray-tir')).toBeTruthy()
    expect(
      findSceneElement(tir.scene, 'educational-ray-tir-segment-0-geometry')
        .props.args,
    ).toEqual(expect.arrayContaining([expect.any(Number), 0.035, 0.035]))
    expect(
      findSceneElement(tir.scene, 'educational-ray-material').props,
    ).toMatchObject({
      color: '#ffe066',
      toneMapped: false,
    })
    expect(
      findSceneElement(
        critical.scene,
        'educational-ray-critical-boundary-segment',
      ),
    ).toBeTruthy()
    expect(
      findSceneElement(
        transmission.scene,
        'educational-ray-transmission-exiting-segment',
      ),
    ).toBeTruthy()
  })

  test('keeps the Step 36 opaque core when the ray layer is disabled', () => {
    const { coreMaterial } = sceneElements(4, 8, { rayViewEnabled: false })

    expect(coreMaterial.props).not.toHaveProperty('transparent')
    expect(coreMaterial.props).not.toHaveProperty('opacity')
    expect(() =>
      findSceneElement(
        FibreGeometryScene({
          coreRadiusUm: 4,
          visualLengthModelUnits: 8,
          rayGuidance: {
            criticalAngleDeg: 80,
            modelId: 'model',
            modelVersion: '1.0.0',
          },
          incidenceAngleDeg: 86,
          rayViewEnabled: false,
        }),
        'educational-ray-tir',
      ),
    ).toThrow()
  })

  test('bounds visual length without changing radial geometry', () => {
    const initial = sceneElements(4, 8)
    const updated = sceneElements(4, 11)
    const bounded = sceneElements(4, 20)

    expect(initial.coreGeometry.props.args).toEqual([0.4, 0.4, 8, 48])
    expect(updated.coreGeometry.props.args).toEqual([0.4, 0.4, 11, 48])
    expect(updated.claddingGeometry.props.args).toEqual([0.85, 0.85, 11, 48])
    expect(bounded.coreGeometry.props.args).toEqual([0.4, 0.4, 12, 48])
  })
})

describe('FibreGeometryView', () => {
  const guidance: RayGuidance = {
    criticalAngleDeg: 80,
    modelId: 'ideal-circular-step-index-guidance',
    modelVersion: '1.0.0',
  }

  test('exposes the named region, visual range control, and demand viewport', () => {
    render(
      <FibreGeometryView
        coreRadiusUm={4.1}
        sectionLengthKm={12.5}
        rayGuidance={guidance}
      />,
    )

    expect(
      screen.getByRole('region', { name: '3D fibre geometry' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Entered core radius')).toBeInTheDocument()
    expect(screen.getByText('4.1 µm')).toBeInTheDocument()
    expect(screen.getByText('Entered section length')).toBeInTheDocument()
    expect(screen.getByText('12.5 km')).toBeInTheDocument()

    const input = screen.getByLabelText('Visual fibre length (model units)')
    expect(input).toHaveAttribute('min', '4')
    expect(input).toHaveAttribute('max', '12')
    expect(input).toHaveAttribute('step', '1')
    expect(input).toHaveValue('8')
    expect(screen.getByText('8 model units')).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: 'Illustrative interactive 3D fibre geometry',
      }),
    ).toHaveAttribute('data-frameloop', 'demand')
    expect(screen.getByLabelText('Educational ray view')).toBeChecked()
  })

  test('handles null entered values and updates the visual length output', () => {
    render(
      <FibreGeometryView
        coreRadiusUm={null}
        sectionLengthKm={null}
        rayGuidance={null}
      />,
    )

    expect(screen.getAllByText('Not entered')).toHaveLength(2)

    const input = screen.getByLabelText('Visual fibre length (model units)')
    fireEvent.change(input, { target: { value: '11' } })

    expect(input).toHaveValue('11')
    expect(screen.getByText('11 model units')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Visual-only length; it changes the displayed cylinder and is not a physical fibre length.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Radial dimensions are normalized for visibility. The cladding shell is illustrative because no cladding diameter is configured. Longitudinal scale is compressed and not to scale.',
      ),
    ).toBeInTheDocument()
  })

  test('provides the educational angle control, backend model facts, and explanation', () => {
    const { container } = render(
      <FibreGeometryView
        coreRadiusUm={4.1}
        sectionLengthKm={12.5}
        rayGuidance={guidance}
      />,
    )

    const incidence = screen.getByLabelText(
      'Incidence angle (degrees, from the interface normal)',
    )

    expect(incidence).toHaveAttribute('min', '0')
    expect(incidence).toHaveAttribute('max', '89.9')
    expect(incidence).toHaveAttribute('step', '0.1')
    expect(incidence).toHaveValue('86')
    expect(screen.getByText('86.0°')).toBeInTheDocument()
    expect(screen.getByText('80.0°')).toBeInTheDocument()
    expect(screen.getByText('Approximate model')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(guidance.modelId))).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(guidance.modelVersion)),
    ).toBeInTheDocument()
    expect(container.querySelector('.ray-explanation')).toHaveTextContent(
      'measured inside core from the boundary normal',
    )
    expect(container.querySelector('.ray-explanation')).toHaveTextContent(
      'only above the critical angle',
    )
    expect(container.querySelector('.ray-explanation')).toHaveTextContent(
      'not longitudinally or radially to scale',
    )
    expect(container.querySelector('.ray-explanation')).toHaveTextContent(
      'backend critical angle',
    )
  })

  test('classifies above, equal, and below critical incidence exactly', () => {
    const { container } = render(
      <FibreGeometryView
        coreRadiusUm={4.1}
        sectionLengthKm={12.5}
        rayGuidance={guidance}
      />,
    )

    const incidence = screen.getByLabelText(
      'Incidence angle (degrees, from the interface normal)',
    )
    const status = container.querySelector('.ray-status')
    expect(status).not.toBeNull()

    expect(status).toHaveAttribute('data-state', 'total_internal_reflection')
    expect(status).toHaveTextContent('Total internal reflection')

    fireEvent.change(incidence, { target: { value: '80' } })
    expect(status).toHaveAttribute('data-state', 'critical_boundary')
    expect(status).toHaveTextContent('Critical boundary')
    expect(status).toHaveTextContent('equals')

    fireEvent.change(incidence, { target: { value: '70' } })
    expect(status).toHaveAttribute('data-state', 'transmission')
    expect(status).toHaveTextContent('Transmission into cladding')
  })

  test('can select the exact backend critical angle when it is between slider steps', () => {
    const preciseGuidance: RayGuidance = {
      criticalAngleDeg: 85.27298324998428,
      modelId: 'ideal-circular-step-index-guidance',
      modelVersion: '1.0.0',
    }
    const { container } = render(
      <FibreGeometryView
        coreRadiusUm={4.1}
        sectionLengthKm={12.5}
        rayGuidance={preciseGuidance}
      />,
    )

    const incidence = screen.getByLabelText(
      'Incidence angle (degrees, from the interface normal)',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Set to critical angle' }),
    )

    expect(incidence).toHaveValue(String(preciseGuidance.criticalAngleDeg))
    expect(container.querySelector('.ray-status')).toHaveAttribute(
      'data-state',
      'critical_boundary',
    )
  })

  test('hides the ray controls and facts when the layer is toggled off', () => {
    render(
      <FibreGeometryView
        coreRadiusUm={4.1}
        sectionLengthKm={12.5}
        rayGuidance={guidance}
      />,
    )

    const toggle = screen.getByLabelText('Educational ray view')
    fireEvent.click(toggle)

    expect(toggle).not.toBeChecked()
    expect(
      screen.queryByLabelText(
        'Incidence angle (degrees, from the interface normal)',
      ),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Approximate model')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect(
      screen.getByLabelText(
        'Incidence angle (degrees, from the interface normal)',
      ),
    ).toBeInTheDocument()
  })

  test('reports unavailable state for null and invalid guidance', () => {
    const { container, rerender } = render(
      <FibreGeometryView
        coreRadiusUm={4.1}
        sectionLengthKm={12.5}
        rayGuidance={null}
      />,
    )

    expect(container.querySelector('.ray-status')).toHaveAttribute(
      'data-state',
      'unavailable',
    )
    expect(container.querySelector('.ray-status')).toHaveTextContent(
      'Ray guidance unavailable',
    )
    expect(screen.getAllByText('Unavailable')).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: 'Set to critical angle' }),
    ).toBeDisabled()

    rerender(
      <FibreGeometryView
        coreRadiusUm={4.1}
        sectionLengthKm={12.5}
        rayGuidance={{
          criticalAngleDeg: Number.NaN,
          modelId: 'invalid',
          modelVersion: '1.0.0',
        }}
      />,
    )

    expect(container.querySelector('.ray-status')).toHaveAttribute(
      'data-state',
      'unavailable',
    )
  })
})
