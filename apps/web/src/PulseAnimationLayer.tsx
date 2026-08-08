import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending } from 'three'

import {
  getFibrePathFrame,
  getTangentQuaternion,
  type FibrePath,
} from './fibreShowcase'
import {
  advancePulseAnimationTime,
  getPulseAnimationProgress,
  getPulseAnimationVisualTransform,
  isValidPulseAnimationData,
  shouldInvalidatePulseAnimationFrame,
  type PulseAnimationData,
} from './pulseAnimation'

export type PulseAnimationLayerProps = {
  data: PulseAnimationData
  visualLength: number
  path: FibrePath
  isPlaying: boolean
  onComplete: () => void
}

export function PulseAnimationRuntime({
  data,
  visualLength,
  path,
  isPlaying,
  onComplete,
}: PulseAnimationLayerProps) {
  const elapsedRef = useRef(0)
  const isPlayingRef = useRef(isPlaying)
  const dataRef = useRef(data)
  const visualLengthRef = useRef(visualLength)
  const pathRef = useRef(path)
  const onCompleteRef = useRef(onComplete)
  const completionNotifiedRef = useRef(false)
  const { invalidate, scene } = useThree()

  useEffect(() => {
    isPlayingRef.current = isPlaying

    if (isPlaying) {
      invalidate()
    }
  }, [invalidate, isPlaying])

  useEffect(() => {
    dataRef.current = data
    visualLengthRef.current = visualLength
    pathRef.current = path
    elapsedRef.current = 0
    completionNotifiedRef.current = false

    const pulseMesh = scene?.getObjectByName('pulse-envelope')

    if (pulseMesh && isValidPulseAnimationData(data)) {
      const transform = getPulseAnimationVisualTransform(data, visualLength, 0)
      const frame = getFibrePathFrame(path, 0)
      const quaternion = getTangentQuaternion(frame.tangent)
      pulseMesh.position.set(...frame.position)
      pulseMesh.quaternion.set(...quaternion)
      pulseMesh.scale.set(
        transform.longitudinalScale,
        transform.transverseScale,
        transform.transverseScale,
      )
    }

    if (isPlayingRef.current) {
      invalidate()
    }
  }, [data, invalidate, path, scene, visualLength])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useFrame((_state, delta) => {
    if (!isPlayingRef.current || !isValidPulseAnimationData(dataRef.current)) {
      return
    }

    elapsedRef.current = advancePulseAnimationTime(elapsedRef.current, delta)
    const progress = getPulseAnimationProgress(elapsedRef.current)
    const transform = getPulseAnimationVisualTransform(
      dataRef.current,
      visualLengthRef.current,
      progress,
    )

    const pulseMesh = scene?.getObjectByName('pulse-envelope')

    if (pulseMesh) {
      const frame = getFibrePathFrame(pathRef.current, transform.progress)
      const quaternion = getTangentQuaternion(frame.tangent)
      pulseMesh.position.set(...frame.position)
      pulseMesh.quaternion.set(...quaternion)
      pulseMesh.scale.set(
        transform.longitudinalScale,
        transform.transverseScale,
        transform.transverseScale,
      )
    }

    if (progress >= 1) {
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true
        onCompleteRef.current()
      }
      return
    }

    if (shouldInvalidatePulseAnimationFrame(isPlayingRef.current, progress)) {
      invalidate()
    }
  })

  if (!isValidPulseAnimationData(data)) {
    return null
  }

  return null
}

export function PulseAnimationLayer({
  data,
  visualLength,
  path,
  isPlaying,
  onComplete,
}: PulseAnimationLayerProps) {
  if (!isValidPulseAnimationData(data)) {
    return null
  }

  const initialTransform = getPulseAnimationVisualTransform(
    data,
    visualLength,
    0,
  )
  const initialFrame = getFibrePathFrame(path, 0)
  const initialQuaternion = getTangentQuaternion(initialFrame.tangent)

  return (
    <group name="pulse-animation-layer">
      <mesh
        name="pulse-envelope"
        position={initialFrame.position}
        quaternion={initialQuaternion}
        scale={[
          initialTransform.longitudinalScale,
          initialTransform.transverseScale,
          initialTransform.transverseScale,
        ]}
      >
        <sphereGeometry name="pulse-envelope-geometry" args={[1, 32, 20]} />
        <meshBasicMaterial
          name="pulse-envelope-material"
          color="#75e6ff"
          transparent
          opacity={0.58}
          blending={AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <PulseAnimationRuntime
        data={data}
        visualLength={visualLength}
        path={path}
        isPlaying={isPlaying}
        onComplete={onComplete}
      />
    </group>
  )
}
