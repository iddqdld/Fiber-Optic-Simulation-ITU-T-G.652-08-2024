import type { components } from '../../../packages/shared_schemas/generated/api'

type MacrobendInput = components['schemas']['MacrobendInput']
type MacrobendLossResult = components['schemas']['MacrobendLossResult']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }

  const actualKeys = Object.keys(value)
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  )
}

function isMacrobendInput(value: unknown): value is MacrobendInput {
  return (
    hasExactKeys(value, [
      'angle_deg',
      'position_fraction',
      'radius_mm',
      'supplied_loss_db',
    ]) &&
    isFiniteNumber(value.position_fraction) &&
    value.position_fraction >= 0 &&
    value.position_fraction <= 1 &&
    isFiniteNumber(value.radius_mm) &&
    value.radius_mm > 0 &&
    isFiniteNumber(value.angle_deg) &&
    value.angle_deg > 0 &&
    value.angle_deg <= 360 &&
    isFiniteNumber(value.supplied_loss_db) &&
    value.supplied_loss_db >= 0
  )
}

export function isMacrobendSequence(value: unknown): value is MacrobendInput[] {
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    !value.every(isMacrobendInput)
  ) {
    return false
  }

  return value.every(
    (bend, index) =>
      index === 0 ||
      value[index - 1].position_fraction < bend.position_fraction,
  )
}

export function macrobendInputsMatch(
  left: readonly MacrobendInput[],
  right: readonly MacrobendInput[],
): boolean {
  return (
    left.length === right.length &&
    left.every((bend, index) => {
      const other = right[index]
      return (
        bend.position_fraction === other.position_fraction &&
        bend.radius_mm === other.radius_mm &&
        bend.angle_deg === other.angle_deg &&
        bend.supplied_loss_db === other.supplied_loss_db
      )
    })
  )
}

function isMacrobendLossPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.position_fraction) &&
    value.position_fraction >= 0 &&
    value.position_fraction <= 1 &&
    isFiniteNumber(value.radius_mm) &&
    value.radius_mm > 0 &&
    isFiniteNumber(value.angle_deg) &&
    value.angle_deg > 0 &&
    value.angle_deg <= 360 &&
    isFiniteNumber(value.supplied_loss_db) &&
    value.supplied_loss_db >= 0 &&
    isFiniteNumber(value.cumulative_bend_loss_db) &&
    value.cumulative_bend_loss_db >= 0 &&
    isFiniteNumber(value.output_power_dbm)
  )
}

export function isMacrobendLossResult(
  value: unknown,
): value is MacrobendLossResult {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.input_power_dbm) ||
    !isFiniteNumber(value.total_bend_loss_db) ||
    value.total_bend_loss_db < 0 ||
    !isFiniteNumber(value.output_power_dbm) ||
    value.output_power_dbm > value.input_power_dbm ||
    !Array.isArray(value.bends) ||
    value.bends.length > 32 ||
    !value.bends.every(isMacrobendLossPoint) ||
    !isRecord(value.model_manifest) ||
    value.model_manifest.model_id !== 'user_supplied_macrobend_loss' ||
    value.model_manifest.model_version !== '1.0.0' ||
    value.model_manifest.loss_source !== 'user_supplied' ||
    value.model_manifest.aggregation !== 'additive_db'
  ) {
    return false
  }

  let cumulativeLossDb = 0
  for (let index = 0; index < value.bends.length; index += 1) {
    const current = value.bends[index]
    cumulativeLossDb += current.supplied_loss_db
    if (
      (index > 0 &&
        value.bends[index - 1].position_fraction >=
          current.position_fraction) ||
      current.cumulative_bend_loss_db !== cumulativeLossDb ||
      current.output_power_dbm !== value.input_power_dbm - cumulativeLossDb
    ) {
      return false
    }
  }

  if (value.bends.length === 0) {
    return (
      value.total_bend_loss_db === 0 &&
      value.output_power_dbm === value.input_power_dbm
    )
  }

  const lastBend = value.bends[value.bends.length - 1]
  return (
    lastBend.cumulative_bend_loss_db === value.total_bend_loss_db &&
    lastBend.output_power_dbm === value.output_power_dbm
  )
}
