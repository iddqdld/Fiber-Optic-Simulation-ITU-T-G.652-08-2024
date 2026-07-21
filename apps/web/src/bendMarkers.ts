import type { components } from '../../../packages/shared_schemas/generated/api'

import { sampleFibrePath, type FibreRouteStyle } from './fibreShowcase'

export type MacrobendInput = components['schemas']['MacrobendInput']

export type BendMarker = {
  id: string
  t: number
  position: [number, number, number]
  radiusMm: number
  angleDeg: number
  suppliedLossDb: number
  hotspotRadius: number
}

const MIN_HOTSPOT = 0.08
const MAX_HOTSPOT = 0.35

export function getBendMarkers(
  route: FibreRouteStyle,
  visualLength: number,
  bends: readonly MacrobendInput[] | null | undefined,
): BendMarker[] {
  if (
    !Array.isArray(bends) ||
    bends.length === 0 ||
    !Number.isFinite(visualLength) ||
    visualLength <= 0
  ) {
    return []
  }

  const path = sampleFibrePath(route, visualLength, 65)
  if (path.length < 2) {
    return []
  }

  return bends.map((bend, index) => {
    const t = Math.min(1, Math.max(0, bend.position_fraction))
    const pathIndex = Math.min(
      path.length - 1,
      Math.max(0, Math.round(t * (path.length - 1))),
    )
    const lossFactor = Math.min(1, Math.max(0, bend.supplied_loss_db / 3))
    const hotspotRadius = MIN_HOTSPOT + lossFactor * (MAX_HOTSPOT - MIN_HOTSPOT)

    return {
      id: `bend-${index}`,
      t,
      position: path[pathIndex].position,
      radiusMm: bend.radius_mm,
      angleDeg: bend.angle_deg,
      suppliedLossDb: bend.supplied_loss_db,
      hotspotRadius,
    }
  })
}

/**
 * Educational placeholder loss from bend geometry for UI prefill only.
 * Not a standards or radiation model — user must still confirm supplied loss.
 */
export function estimateEducationalBendLossDb(
  radiusMm: number,
  angleDeg: number,
): number {
  if (
    !Number.isFinite(radiusMm) ||
    radiusMm <= 0 ||
    !Number.isFinite(angleDeg) ||
    angleDeg <= 0
  ) {
    return 0
  }

  const radiusFactor = Math.min(2.5, 30 / radiusMm)
  const angleFactor = angleDeg / 90
  return Math.round(radiusFactor * angleFactor * 1000) / 1000
}
