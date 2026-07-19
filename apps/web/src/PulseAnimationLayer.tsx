import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending } from 'three'

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
  isPlaying: boolean
  onComplete: () => void
}

export function PulseAnimationRuntime({
  data,
  visualLength,
  isPlaying,
  onComplete,
}: PulseAnimationLayerProps) {
  const elapsedRef = useRef(0)
  const isPlayingRef = useRef(isPlaying)
  const dataRef = useRef(data)
  const visualLengthRef = useRef(visualLength)
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
    elapsedRef.current = 0
    completionNotifiedRef.current = false

    const pulseMesh = scene?.getObjectByName('pulse-envelope')

    if (pulseMesh && isValidPulseAnimationData(data)) {
      const transform = getPulseAnimationVisualTransform(data, visualLength, 0)
      pulseMesh.position.set(transform.positionX, 0, 0)
      pulseMesh.scale.set(
        transform.longitudinalScale,
        transform.transverseScale,
        transform.transverseScale,
      )
    }

    if (isPlayingRef.current) {
      invalidate()
    }
  }, [data, invalidate, scene, visualLength])

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
      pulseMesh.position.set(transform.positionX, 0, 0)
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

  return (
    <group name="pulse-animation-layer">
      <mesh
        name="pulse-envelope"
        position={[initialTransform.positionX, 0, 0]}
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
        isPlaying={isPlaying}
        onComplete={onComplete}
      />
    </group>
  )
}
