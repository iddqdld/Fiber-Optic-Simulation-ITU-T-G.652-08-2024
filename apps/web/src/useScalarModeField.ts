import { useEffect, useMemo, useState } from 'react'

import {
  isScalarLPModeCatalog,
  isScalarLPModeFieldResult,
  toScalarModeFieldData,
  type ScalarLPModeCatalog,
  type ScalarLPModeFamily,
  type ScalarLPModeFieldRequest,
  type ScalarModeFieldData,
} from './scalarMode'

export type ScalarModeFieldState = {
  data: ScalarModeFieldData | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  message: string | null
}

type SettledScalarModeFieldState = ScalarModeFieldState & {
  request: ScalarLPModeFieldRequest
}

async function loadScalarModeField(
  request: ScalarLPModeFieldRequest,
  signal: AbortSignal,
): Promise<ScalarModeFieldState> {
  try {
    const response = await fetch('/api/v1/modes/scalar-lp/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
    if (!response.ok) {
      return {
        data: null,
        status: 'error',
        message: 'The selected scalar mode field is unavailable.',
      }
    }
    const body: unknown = await response.json().catch(() => null)
    if (!isScalarLPModeFieldResult(body, request)) {
      return {
        data: null,
        status: 'error',
        message: 'The selected scalar mode field is unavailable.',
      }
    }
    return {
      data: toScalarModeFieldData(body),
      status: 'ready',
      message: null,
    }
  } catch {
    return {
      data: null,
      status: 'error',
      message: 'The scalar mode service is unavailable.',
    }
  }
}

export function useScalarModeField(
  catalog: ScalarLPModeCatalog | null,
  selectedMode: ScalarLPModeFamily | null,
  gridHalfWidthUm: number | null,
  gridPoints: number | null,
): ScalarModeFieldState {
  const request = useMemo<ScalarLPModeFieldRequest | null>(() => {
    if (
      !isScalarLPModeCatalog(catalog) ||
      selectedMode === null ||
      !catalog.mode_families.some(
        (mode) =>
          mode.azimuthal_order === selectedMode.azimuthal_order &&
          mode.radial_order === selectedMode.radial_order,
      ) ||
      gridHalfWidthUm === null ||
      !Number.isFinite(gridHalfWidthUm) ||
      gridHalfWidthUm <= 0 ||
      gridPoints === null ||
      !Number.isSafeInteger(gridPoints) ||
      gridPoints < 3 ||
      gridPoints > 65 ||
      gridPoints % 2 === 0
    ) {
      return null
    }
    return {
      wavelength_m: catalog.wavelength_m,
      core_radius_m: catalog.core_radius_m,
      n_core: catalog.n_core,
      n_cladding: catalog.n_cladding,
      azimuthal_order: selectedMode.azimuthal_order,
      radial_order: selectedMode.radial_order,
      grid_half_width_m: gridHalfWidthUm * 1e-6,
      grid_points: gridPoints,
    }
  }, [catalog, gridHalfWidthUm, gridPoints, selectedMode])
  const [settledState, setSettledState] =
    useState<SettledScalarModeFieldState | null>(null)

  useEffect(() => {
    if (request === null) {
      return
    }

    const controller = new AbortController()
    void loadScalarModeField(request, controller.signal).then((nextState) => {
      if (!controller.signal.aborted) {
        setSettledState({ request, ...nextState })
      }
    })

    return () => controller.abort()
  }, [request])

  if (request === null) {
    return { data: null, status: 'idle', message: null }
  }
  if (settledState === null || settledState.request !== request) {
    return {
      data: null,
      status: 'loading',
      message: 'Scalar mode field calculation in progress.',
    }
  }
  return settledState
}
