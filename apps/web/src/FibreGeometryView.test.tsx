import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useFrame, useThree } from '@react-three/fiber'

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
  useFrame: vi.fn(),
  useThree: vi.fn(() => ({ invalidate: vi.fn() })),
}))

import {
  CameraPresetController,
  FibreGeometryScene,
  FibreGeometryView,
  type ModeProfileData,
  type PulseAnimationData,
  type RayGuidance,
} from './FibreGeometryView'
import {
  PULSE_MAX_VISUAL_WIDTH_RATIO,
  PULSE_VISUAL_DURATION_SECONDS,
  getPulseAnimationProgress,
  getPulseAnimationVisualTransform,
  getPulseVisualWidthRatio,
  isValidPulseAnimationData,
  shouldInvalidatePulseAnimationFrame,
} from './pulseAnimation'
import { PulseAnimationRuntime } from './PulseAnimationLayer'
import type { PowerDistanceData } from './powerDistancePlot'
import { defaultVisualizationSettings } from './visualizationSettings'

type SceneElementProps = {
  args?: unknown[]
  blending?: unknown
  color?: string
  children?: ReactNode
  depthWrite?: boolean
  name?: string
  opacity?: number
  array?: unknown
  count?: number
  depthTest?: boolean
  itemSize?: number
  position?: unknown
  rotation?: unknown
  scale?: unknown
  toneMapped?: boolean
  transparent?: boolean
  size?: number
  sizeAttenuation?: boolean
  vertexColors?: boolean
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
    modeProfile?: ModeProfileData | null
    modeViewEnabled?: boolean
    pulseAnimation?: PulseAnimationData | null
    pulseAnimationEnabled?: boolean
    pulseAnimationPlaying?: boolean
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

const modeAxis = [-4, 0, 4]
const modeFieldRadiusUm = 4.82
const modeIntensity = modeAxis.map((yUm) =>
  modeAxis.map((xUm) =>
    Math.exp((-2 * (xUm ** 2 + yUm ** 2)) / modeFieldRadiusUm ** 2),
  ),
)

const modeProfile = {
  modeFieldRadiusUm: 4.82,
  gridHalfWidthUm: 4,
  gridPoints: 3,
  xUm: modeAxis,
  yUm: modeAxis,
  normalizedIntensity: modeIntensity,
  modelId: 'gaussian_lp01_mode_profile',
  modelVersion: '1.0.0',
  normalizationConvention: 'unit_peak_field_and_intensity',
  radiusConvention: '1/e_field_radius',
} satisfies ModeProfileData

const pulseAnimation = {
  inputPulseFwhmPs: 25,
  outputPulseFwhmPs: 49.30770730829005,
  dispersionBroadeningFwhmPs: 42.5,
  sectionLengthKm: 12.5,
  groupDelayPs: 61209011.468860894,
  modelId: 'first_order_chromatic_pulse_broadening',
  modelVersion: '1.0.0',
  widthConvention: 'fwhm',
  delayModelId: 'constant_group_index_delay',
  delayModelVersion: '1.0.0',
} satisfies PulseAnimationData

const attenuation = {
  lengthKm: 12.5,
  attenuationDbPerKm: 0.2,
  inputPowerDbm: -3,
  sectionLossDb: 2.5,
  outputPowerDbm: -5.5,
  distanceSamplesKm: [0, 3, 6.5, 12.5],
  powerSamplesDbm: [-3, -3.6, -4.3, -5.5],
  modelId: 'constant_fibre_attenuation',
  modelVersion: '1.0.0',
} satisfies PowerDistanceData

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
    expect(
      findSceneElement(transmission.scene, 'educational-ray-leakage-point'),
    ).toBeTruthy()
    expect(
      findSceneElement(transmission.scene, 'educational-ray-leakage-marker-0'),
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

  test('renders backend samples in one mapped transverse points buffer', () => {
    const { scene, coreMaterial } = sceneElements(4, 8, {
      modeProfile,
      rayViewEnabled: false,
    })
    const points = findSceneElement(scene, 'approximate-lp01-field')
    const positionAttribute = findSceneElement(
      scene,
      'approximate-lp01-field-position-attribute',
    )
    const intensityAttribute = findSceneElement(
      scene,
      'approximate-lp01-field-intensity-attribute',
    )
    const material = findSceneElement(scene, 'approximate-lp01-field-material')
    const positions = positionAttribute.props.array as Float32Array
    const intensities = intensityAttribute.props.array as Float32Array

    expect(points.props.name).toBe('approximate-lp01-field')
    expect(positionAttribute.props).toMatchObject({ count: 9, itemSize: 3 })
    expect(intensityAttribute.props).toMatchObject({ count: 9, itemSize: 1 })
    expect(positionAttribute.props.args?.[1]).toBe(3)
    expect(intensityAttribute.props.args?.[1]).toBe(1)
    expect(positions[0]).toBe(0)
    expect(positions[1]).toBeCloseTo(-0.4)
    expect(positions[2]).toBeCloseTo(-0.4)
    expect(Array.from(positions.slice(12, 15))).toEqual([0, 0, 0])
    expect(positions[24]).toBe(0)
    expect(positions[25]).toBeCloseTo(0.4)
    expect(positions[26]).toBeCloseTo(0.4)
    expect(intensities[0]).toBeCloseTo(modeProfile.normalizedIntensity[0][0])
    expect(intensities[4]).toBe(1)
    expect(intensities).toHaveLength(9)
    expect(material.props).toMatchObject({
      size: expect.any(Number),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: expect.anything(),
    })
    expect(
      findSceneElement(scene, 'approximate-lp01-field-radius-ring'),
    ).toBeTruthy()
    expect(findSceneElement(scene, 'approximate-lp01-field-glow')).toBeTruthy()
    expect(coreMaterial.props).toMatchObject({
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  })

  test('omits samples below the disclosed display threshold', () => {
    const thresholdedProfile = {
      ...modeProfile,
      normalizedIntensity: modeProfile.normalizedIntensity.map((row) => [
        ...row,
      ]),
    }
    thresholdedProfile.normalizedIntensity[0][0] = 0.009
    const { scene } = sceneElements(4, 8, {
      modeProfile: thresholdedProfile,
      rayViewEnabled: false,
    })
    const positionAttribute = findSceneElement(
      scene,
      'approximate-lp01-field-position-attribute',
    )
    const intensityAttribute = findSceneElement(
      scene,
      'approximate-lp01-field-intensity-attribute',
    )
    const intensities = intensityAttribute.props.array as Float32Array

    expect(positionAttribute.props.count).toBe(8)
    expect(intensityAttribute.props.count).toBe(8)
    expect(
      Array.from(intensities).every((intensity) => intensity >= 0.01),
    ).toBe(true)
  })

  test('does not render field geometry when disabled or malformed', () => {
    const disabled = sceneElements(4, 8, {
      modeProfile,
      rayViewEnabled: false,
      modeViewEnabled: false,
    })
    const malformed = {
      ...modeProfile,
      xUm: [-15, 0],
    } as unknown as ModeProfileData
    const invalid = sceneElements(4, 8, {
      modeProfile: malformed,
      rayViewEnabled: false,
    })

    expect(() =>
      findSceneElement(disabled.scene, 'approximate-lp01-field'),
    ).toThrow()
    expect(() =>
      findSceneElement(invalid.scene, 'approximate-lp01-field'),
    ).toThrow()
    expect(disabled.coreMaterial.props).not.toHaveProperty('transparent')
    expect(invalid.coreMaterial.props).not.toHaveProperty('transparent')
  })

  test('renders curved fibre bodies and keeps cladding independently optional', () => {
    const curved = FibreGeometryScene({
      coreRadiusUm: 4,
      visualLengthModelUnits: 8,
      fibreRoute: 's_bend',
      claddingVisible: false,
      rayViewEnabled: false,
      modeViewEnabled: false,
      pulseAnimationEnabled: false,
    })

    expect(findSceneElement(curved, 'curved-fibre-body')).toBeTruthy()
    expect(findSceneElement(curved, 'solid-core-geometry').type).toBe(
      'tubeGeometry',
    )
    expect(() =>
      findSceneElement(curved, 'illustrative-cladding-shell'),
    ).toThrow()
  })

  test('keeps standalone power and pulse markers visible through the core', () => {
    const powerScene = FibreGeometryScene({
      coreRadiusUm: 4,
      visualLengthModelUnits: 8,
      rayViewEnabled: false,
      modeViewEnabled: false,
      pulseAnimationEnabled: false,
      powerIndicatorsEnabled: true,
      attenuation,
    })
    const pulseScene = FibreGeometryScene({
      coreRadiusUm: 4,
      visualLengthModelUnits: 8,
      rayViewEnabled: false,
      modeViewEnabled: false,
      pulseAnimation,
      pulseAnimationEnabled: false,
      pulseMarkersEnabled: true,
    })

    expect(findSceneElement(powerScene, 'spatial-power-layer')).toBeTruthy()
    expect(
      findSceneElement(powerScene, 'solid-core-material').props,
    ).toMatchObject({ transparent: true, opacity: 0.42, depthWrite: false })
    expect(
      findSceneElement(pulseScene, 'spatial-pulse-marker-layer'),
    ).toBeTruthy()
    expect(
      findSceneElement(pulseScene, 'solid-core-material').props,
    ).toMatchObject({ transparent: true, opacity: 0.42, depthWrite: false })
  })

  test('renders every optional marker layer from valid data', () => {
    const scene = FibreGeometryScene({
      coreRadiusUm: 4,
      sectionLengthKm: 12.5,
      visualLengthModelUnits: 8,
      scaleMarkersEnabled: true,
      powerIndicatorsEnabled: true,
      pulseMarkersEnabled: true,
      attenuation,
      pulseAnimation,
    })

    expect(findSceneElement(scene, 'scale-marker-layer')).toBeTruthy()
    expect(findSceneElement(scene, 'spatial-power-layer')).toBeTruthy()
    expect(findSceneElement(scene, 'spatial-pulse-marker-layer')).toBeTruthy()
  })
})

describe('pulse animation mapping', () => {
  test('uses a fixed four-second visual transit with clamped entrance, midpoint, and output transforms', () => {
    expect(PULSE_VISUAL_DURATION_SECONDS).toBe(4)
    expect(getPulseAnimationProgress(-1)).toBe(0)
    expect(getPulseAnimationProgress(0)).toBe(0)
    expect(getPulseAnimationProgress(2)).toBe(0.5)
    expect(getPulseAnimationProgress(4)).toBe(1)
    expect(getPulseAnimationProgress(8)).toBe(1)
    expect(shouldInvalidatePulseAnimationFrame(false, 0.5)).toBe(false)
    expect(shouldInvalidatePulseAnimationFrame(true, 0.5)).toBe(true)
    expect(shouldInvalidatePulseAnimationFrame(true, 1)).toBe(false)

    const entrance = getPulseAnimationVisualTransform(pulseAnimation, 8, 0)
    const midpoint = getPulseAnimationVisualTransform(pulseAnimation, 8, 0.5)
    const output = getPulseAnimationVisualTransform(pulseAnimation, 8, 1)
    const expectedOutputRatio =
      pulseAnimation.outputPulseFwhmPs / pulseAnimation.inputPulseFwhmPs

    expect(entrance).toMatchObject({
      progress: 0,
      positionX: -4,
      visualWidthRatio: 1,
    })
    expect(midpoint.positionX).toBe(0)
    expect(midpoint.visualWidthRatio).toBeCloseTo(
      1 + (expectedOutputRatio - 1) / 2,
    )
    expect(output).toMatchObject({
      progress: 1,
      positionX: 4,
      visualWidthRatio: expectedOutputRatio,
    })
    expect(
      getPulseAnimationVisualTransform(pulseAnimation, 8, 2).positionX,
    ).toBe(4)
  })

  test('caps only the visual width ratio and validates exact backend manifests', () => {
    const veryBroadPulse = {
      ...pulseAnimation,
      outputPulseFwhmPs: pulseAnimation.inputPulseFwhmPs * 20,
    }

    expect(getPulseVisualWidthRatio(veryBroadPulse, 1)).toBe(
      PULSE_MAX_VISUAL_WIDTH_RATIO,
    )
    expect(getPulseVisualWidthRatio(veryBroadPulse, 0.5)).toBe(
      (1 + PULSE_MAX_VISUAL_WIDTH_RATIO) / 2,
    )
    expect(isValidPulseAnimationData(pulseAnimation)).toBe(true)
    expect(
      isValidPulseAnimationData({
        ...pulseAnimation,
        sectionLengthKm: 0,
      }),
    ).toBe(false)
    expect(
      isValidPulseAnimationData({
        ...pulseAnimation,
        delayModelId: 'wrong-delay-model',
      }),
    ).toBe(false)
    expect(
      isValidPulseAnimationData({
        ...pulseAnimation,
        outputPulseFwhmPs: pulseAnimation.inputPulseFwhmPs - 1,
      }),
    ).toBe(false)
  })
})

describe('pulse animation scene layer', () => {
  test('declares an additive translucent envelope and makes the core translucent', () => {
    const scene = FibreGeometryScene({
      coreRadiusUm: 4,
      visualLengthModelUnits: 8,
      pulseAnimation,
      pulseAnimationEnabled: true,
    })
    const layer = findSceneElement(scene, 'pulse-animation-layer')
    const envelope = findSceneElement(scene, 'pulse-envelope')
    const material = findSceneElement(scene, 'pulse-envelope-material')
    const coreMaterial = findSceneElement(scene, 'solid-core-material')

    expect(layer.props.name).toBe('pulse-animation-layer')
    expect(envelope.props).toMatchObject({
      position: [-4, 0, 0],
      scale: [0.55, 0.74, 0.74],
    })
    expect(material.props).toMatchObject({
      color: '#75e6ff',
      transparent: true,
      opacity: 0.58,
      blending: expect.any(Number),
      depthWrite: false,
      depthTest: false,
    })
    expect(coreMaterial.props).toMatchObject({
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  })

  test('omits the pulse geometry when the layer is disabled or data is unavailable', () => {
    const disabled = FibreGeometryScene({
      coreRadiusUm: 4,
      visualLengthModelUnits: 8,
      pulseAnimation,
      pulseAnimationEnabled: false,
    })
    const unavailable = FibreGeometryScene({
      coreRadiusUm: 4,
      visualLengthModelUnits: 8,
      pulseAnimation: { ...pulseAnimation, groupDelayPs: 0 },
    })

    expect(() => findSceneElement(disabled, 'pulse-envelope')).toThrow()
    expect(() => findSceneElement(unavailable, 'pulse-envelope')).toThrow()
    expect(
      findSceneElement(disabled, 'solid-core-material').props,
    ).not.toHaveProperty('transparent')
    expect(
      findSceneElement(unavailable, 'solid-core-material').props,
    ).not.toHaveProperty('transparent')
  })
})

describe('pulse animation runtime', () => {
  test('starts idle, pauses without advancing, resumes, and completes only once', () => {
    let frameCallback: Parameters<typeof useFrame>[0] | null = null
    const invalidate = vi.fn()
    const positionSet = vi.fn()
    const scaleSet = vi.fn()
    const onComplete = vi.fn()
    const threeState = {
      invalidate,
      scene: {
        getObjectByName: () => ({
          position: { set: positionSet },
          scale: { set: scaleSet },
        }),
      },
    }

    vi.mocked(useFrame).mockImplementation((callback) => {
      frameCallback = callback
      return null
    })
    vi.mocked(useThree).mockImplementation(() => threeState as never)

    const { rerender } = render(
      <PulseAnimationRuntime
        data={pulseAnimation}
        visualLength={8}
        isPlaying={false}
        onComplete={onComplete}
      />,
    )

    expect(frameCallback).not.toBeNull()
    expect(invalidate).not.toHaveBeenCalled()
    expect(positionSet).toHaveBeenLastCalledWith(-4, 0, 0)

    rerender(
      <PulseAnimationRuntime
        data={pulseAnimation}
        visualLength={8}
        isPlaying
        onComplete={onComplete}
      />,
    )
    expect(invalidate).toHaveBeenCalledTimes(1)

    act(() => {
      frameCallback?.({} as never, 2)
    })
    expect(positionSet).toHaveBeenLastCalledWith(0, 0, 0)
    expect(scaleSet).toHaveBeenLastCalledWith(
      0.55 *
        (1 +
          (pulseAnimation.outputPulseFwhmPs / pulseAnimation.inputPulseFwhmPs -
            1) /
            2),
      0.74,
      0.74,
    )
    expect(invalidate).toHaveBeenCalledTimes(2)

    rerender(
      <PulseAnimationRuntime
        data={pulseAnimation}
        visualLength={8}
        isPlaying={false}
        onComplete={onComplete}
      />,
    )
    const positionCallCount = positionSet.mock.calls.length
    act(() => {
      frameCallback?.({} as never, 1)
    })
    expect(positionSet).toHaveBeenCalledTimes(positionCallCount)

    rerender(
      <PulseAnimationRuntime
        data={pulseAnimation}
        visualLength={8}
        isPlaying
        onComplete={onComplete}
      />,
    )
    expect(invalidate).toHaveBeenCalledTimes(3)

    act(() => {
      frameCallback?.({} as never, 2)
    })
    expect(positionSet).toHaveBeenLastCalledWith(4, 0, 0)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledTimes(3)

    act(() => {
      frameCallback?.({} as never, 1)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledTimes(3)
  })
})

describe('camera preset controller', () => {
  test('leaves a custom camera untouched and restores a selected preset', () => {
    const positionSet = vi.fn()
    const lookAt = vi.fn()
    const updateProjectionMatrix = vi.fn()
    const invalidate = vi.fn()

    vi.mocked(useThree).mockImplementation(
      () =>
        ({
          camera: {
            position: { set: positionSet },
            lookAt,
            updateProjectionMatrix,
          },
          invalidate,
        }) as never,
    )

    const { rerender } = render(<CameraPresetController preset={null} />)

    expect(positionSet).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()

    rerender(<CameraPresetController preset="side" />)

    expect(positionSet).toHaveBeenCalledWith(0, 0, 16)
    expect(lookAt).toHaveBeenCalledWith(0, 0, 0)
    expect(updateProjectionMatrix).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledOnce()
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
        modeProfile={null}
        pulseAnimation={null}
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

  test('discloses friendly route, custom camera, and exact marker values', () => {
    render(
      <FibreGeometryView
        coreRadiusUm={4}
        sectionLengthKm={12.5}
        rayGuidance={guidance}
        modeProfile={null}
        pulseAnimation={pulseAnimation}
        attenuation={attenuation}
        visualizationSettings={{
          ...defaultVisualizationSettings,
          fibreRoute: 'gentle_arc',
          cameraPreset: null,
        }}
      />,
    )

    const legend = screen.getByLabelText('3D showcase legend')

    expect(within(legend).getByText('Gentle arc')).toBeVisible()
    expect(within(legend).getByText('Custom')).toBeVisible()
    expect(
      within(legend).getByRole('list', { name: 'Scale marker positions' }),
    ).toHaveTextContent('L (12.50 km)')
    expect(
      within(legend).getByRole('list', {
        name: 'Spatial power marker values',
      }),
    ).toHaveTextContent('3 km: -3.6 dBm')
    expect(
      within(legend).getByRole('list', {
        name: 'Spatial pulse marker values',
      }),
    ).toHaveTextContent('Output FWHM: 49.30770730829005 ps')
  })

  test('handles null entered values and updates the visual length output', () => {
    render(
      <FibreGeometryView
        coreRadiusUm={null}
        sectionLengthKm={null}
        rayGuidance={null}
        modeProfile={null}
        pulseAnimation={null}
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
        'Radial dimensions are normalized for visibility. The cladding shell is illustrative because no cladding diameter is configured. Longitudinal scale is compressed and not to scale. Curved routes are display-only path styles; they do not change Level 1 physics.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Approximate LP01 field')).toBeChecked()
    expect(
      screen.getByText(/Approximate LP01 field unavailable/),
    ).toBeInTheDocument()
  })

  test('shows the paused scaled pulse layer, exact physical facts, controls, and disclosures', () => {
    const { container } = render(
      <FibreGeometryView
        coreRadiusUm={4}
        sectionLengthKm={12.5}
        rayGuidance={null}
        modeProfile={null}
        pulseAnimation={pulseAnimation}
      />,
    )

    const toggle = screen.getByLabelText('Scaled pulse animation')
    expect(toggle).toBeChecked()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Reset/Restart' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Paused at entrance.')).toBeInTheDocument()
    expect(screen.getByText('Animation time is scaled')).toBeInTheDocument()
    expect(screen.getByText('25 ps')).toBeInTheDocument()
    expect(screen.getByText('49.30770730829005 ps')).toBeInTheDocument()
    expect(screen.getByText('42.5 ps')).toBeInTheDocument()
    expect(
      within(container.querySelector('.pulse-facts') as HTMLElement).getByText(
        '12.5 km',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('61209011.468860894 ps')).toBeInTheDocument()
    expect(screen.getByText('4 s')).toBeInTheDocument()
    expect(
      screen.getByText(/first_order_chromatic_pulse_broadening/),
    ).toBeInTheDocument()
    expect(screen.getByText(/constant_group_index_delay/)).toBeInTheDocument()
    expect(screen.getByText('fwhm')).toBeInTheDocument()

    const explanation = container.querySelector('.pulse-animation-explanation')
    expect(explanation).toHaveTextContent('visual-only interpolation')
    expect(explanation).toHaveTextContent(
      'not a physics-derived intermediate pulse-width series',
    )
    expect(explanation).toHaveTextContent(
      'Temporal FWHM is not a physical spatial pulse length',
    )
    expect(explanation).toHaveTextContent('do not encode power or attenuation')
    expect(explanation).toHaveTextContent('No chirp')
    expect(explanation).toHaveTextContent('higher-order')
    expect(explanation).toHaveTextContent('nonlinear')
    expect(explanation).toHaveTextContent('full-wave propagation')

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(
      screen.getByText('Playing: visual transit in progress.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByText('Paused in transit.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset/Restart' }))
    expect(screen.getByText('Paused at entrance.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(
      screen.queryByText('Animation time is scaled'),
    ).not.toBeInTheDocument()
  })

  test('reports a non-moving unavailable state for invalid pulse data', () => {
    const { container } = render(
      <FibreGeometryView
        coreRadiusUm={4}
        sectionLengthKm={12.5}
        rayGuidance={null}
        modeProfile={null}
        pulseAnimation={{ ...pulseAnimation, groupDelayPs: 0 }}
      />,
    )

    expect(screen.getByLabelText('Scaled pulse animation')).toBeChecked()
    expect(
      container.querySelector('.pulse-animation-status'),
    ).toHaveTextContent('Scaled pulse animation unavailable')
    expect(
      container.querySelector('.pulse-animation-status'),
    ).toHaveTextContent('No pulse geometry is rendered and it is not moving')
    expect(screen.getByText('Animation time is scaled')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Play' }),
    ).not.toBeInTheDocument()
  })

  test('resets playback for a replacement preview and after layer toggling', () => {
    const { rerender } = render(
      <FibreGeometryView
        coreRadiusUm={4}
        sectionLengthKm={12.5}
        rayGuidance={null}
        modeProfile={null}
        pulseAnimation={pulseAnimation}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    rerender(
      <FibreGeometryView
        coreRadiusUm={4}
        sectionLengthKm={12.5}
        rayGuidance={null}
        modeProfile={null}
        pulseAnimation={{ ...pulseAnimation }}
      />,
    )
    expect(screen.getByText('Paused at entrance.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    const toggle = screen.getByLabelText('Scaled pulse animation')
    fireEvent.click(toggle)
    fireEvent.click(toggle)

    expect(screen.getByText('Paused at entrance.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  test('keeps the animation unavailable when the preview length is stale', () => {
    const { container } = render(
      <FibreGeometryView
        coreRadiusUm={4}
        sectionLengthKm={10}
        rayGuidance={null}
        modeProfile={null}
        pulseAnimation={pulseAnimation}
      />,
    )

    expect(
      container.querySelector('.pulse-animation-status'),
    ).toHaveTextContent('animation and current form section lengths must match')
    expect(
      screen.queryByRole('button', { name: 'Play' }),
    ).not.toBeInTheDocument()
  })

  test('shows field facts, conventions, explanation, and an independent toggle', () => {
    const { container } = render(
      <FibreGeometryView
        coreRadiusUm={4}
        sectionLengthKm={12.5}
        rayGuidance={null}
        modeProfile={modeProfile}
        pulseAnimation={null}
      />,
    )

    const toggle = screen.getByLabelText('Approximate LP01 field')
    expect(toggle).toBeChecked()
    expect(screen.getByText('Mode-field radius')).toBeInTheDocument()
    expect(screen.getByText('4.82 µm')).toBeInTheDocument()
    expect(screen.getByText('Grid half-width')).toBeInTheDocument()
    expect(screen.getByText('±4 µm')).toBeInTheDocument()
    expect(screen.getByText('3 × 3 (9 samples)')).toBeInTheDocument()
    expect(
      screen.getByText('Normalized intensity (dimensionless)'),
    ).toBeInTheDocument()
    expect(screen.getByText('0–1')).toBeInTheDocument()
    expect(screen.getByText('Display threshold')).toBeInTheDocument()
    expect(screen.getByText('≥ 0.01 normalized intensity')).toBeInTheDocument()
    expect(
      within(container.querySelector('.mode-facts') as HTMLElement).getByText(
        'Approximate model',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/gaussian_lp01_mode_profile/)).toBeInTheDocument()
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument()
    expect(
      screen.getByText('unit_peak_field_and_intensity'),
    ).toBeInTheDocument()
    expect(screen.getByText('1/e_field_radius')).toBeInTheDocument()

    const explanation = document.querySelector('.mode-profile-explanation')
    expect(explanation).toHaveTextContent(
      'scalar, circularly symmetric Gaussian LP01 approximation',
    )
    expect(explanation).toHaveTextContent(
      'backend normalized-intensity samples',
    )
    expect(explanation).toHaveTextContent('heat colormap')
    expect(explanation).toHaveTextContent('1/e field radius')
    expect(explanation).toHaveTextContent('not a physical ray path')
    expect(explanation).toHaveTextContent('not an exact step-index eigenmode')
    expect(explanation).toHaveTextContent('full-wave electromagnetic solution')
    expect(explanation).toHaveTextContent(
      'Samples below 0.01, or 1% of unit peak, are omitted',
    )

    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(
      screen.queryByText('gaussian_lp01_mode_profile (1.0.0)'),
    ).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect(
      screen.getByText('gaussian_lp01_mode_profile (1.0.0)'),
    ).toBeInTheDocument()
  })

  test('reports unavailable state and keeps malformed field data out of the scene', () => {
    const malformed = {
      ...modeProfile,
      normalizedIntensity: [[1]],
    } as unknown as ModeProfileData
    const { container } = render(
      <FibreGeometryView
        coreRadiusUm={4}
        sectionLengthKm={12.5}
        rayGuidance={null}
        modeProfile={malformed}
        pulseAnimation={null}
      />,
    )

    expect(container.querySelector('.mode-profile-status')).toHaveTextContent(
      'Approximate LP01 field unavailable',
    )
    expect(
      container.querySelector('.mode-profile-explanation'),
    ).toBeInTheDocument()
  })

  test('provides the educational angle control, backend model facts, and explanation', () => {
    const { container } = render(
      <FibreGeometryView
        coreRadiusUm={4.1}
        sectionLengthKm={12.5}
        rayGuidance={guidance}
        modeProfile={null}
        pulseAnimation={null}
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
        modeProfile={null}
        pulseAnimation={null}
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
    expect(status).toHaveTextContent('Leakage into cladding')
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
        modeProfile={null}
        pulseAnimation={null}
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
        modeProfile={null}
        pulseAnimation={null}
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
        modeProfile={null}
        pulseAnimation={null}
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
        modeProfile={null}
        pulseAnimation={null}
      />,
    )

    expect(container.querySelector('.ray-status')).toHaveAttribute(
      'data-state',
      'unavailable',
    )
  })
})
