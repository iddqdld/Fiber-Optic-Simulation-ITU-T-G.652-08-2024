import { describe, expect, test } from 'vitest'

import { estimateEducationalBendLossDb, getBendMarkers } from './bendMarkers'

describe('bendMarkers', () => {
  test('places bends along a straight route by position fraction', () => {
    const markers = getBendMarkers('straight', 8, [
      {
        position_fraction: 0.25,
        radius_mm: 15,
        angle_deg: 90,
        supplied_loss_db: 0.5,
      },
      {
        position_fraction: 0.75,
        radius_mm: 10,
        angle_deg: 180,
        supplied_loss_db: 1.5,
      },
    ])

    expect(markers).toHaveLength(2)
    expect(markers[0].t).toBe(0.25)
    expect(markers[1].t).toBe(0.75)
    expect(markers[1].hotspotRadius).toBeGreaterThan(markers[0].hotspotRadius)
  })

  test('returns empty markers for invalid inputs', () => {
    expect(getBendMarkers('straight', 8, [])).toEqual([])
    expect(getBendMarkers('straight', Number.NaN, [
      {
        position_fraction: 0.5,
        radius_mm: 10,
        angle_deg: 90,
        supplied_loss_db: 0.1,
      },
    ])).toEqual([])
  })

  test('estimates a positive educational loss for tight bends', () => {
    expect(estimateEducationalBendLossDb(10, 90)).toBeGreaterThan(0)
    expect(estimateEducationalBendLossDb(0, 90)).toBe(0)
  })
})
