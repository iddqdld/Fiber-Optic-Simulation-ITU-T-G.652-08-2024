import type { PandaFieldResult } from './pandaFieldModel'

export function corePrincipalAxisAngle(
  result: PandaFieldResult,
): number | null {
  const coreX = result.configuration.geometry.core_center_x_m
  const coreY = result.configuration.geometry.core_center_y_m
  let nearest: { row: number; column: number; distance: number } | null = null

  for (let row = 0; row < result.y_coordinates_m.length; row += 1) {
    const y = result.y_coordinates_m[row]
    for (let column = 0; column < result.x_coordinates_m.length; column += 1) {
      const x = result.x_coordinates_m[column]
      if (!result.validity_mask[row]?.[column]) {
        continue
      }
      const distance = (x - coreX) ** 2 + (y - coreY) ** 2
      if (nearest === null || distance < nearest.distance) {
        nearest = { row, column, distance }
      }
    }
  }

  return nearest === null
    ? null
    : (result.principal_axis_angle_rad[nearest.row]?.[nearest.column] ?? null)
}
