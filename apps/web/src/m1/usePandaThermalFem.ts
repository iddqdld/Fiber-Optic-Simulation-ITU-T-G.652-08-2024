import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  initialPandaThermalFemControls,
  isPandaThermalFemResult,
  pandaThermalFemRequestsMatch,
  parsePandaThermalFemValues,
  type PandaThermalFemAxialCondition,
  type PandaThermalFemController,
  type PandaThermalFemControls,
  type PandaThermalFemPhase,
  type PandaThermalFemRefinementLevel,
  type PandaThermalFemRequest,
  type PandaThermalFemResult,
  type PandaThermalFemTorsionCapability,
  type PandaThermalFemTorsionInputMode,
} from './pandaThermalFemModel'
import {
  initialPandaFieldValues,
  type PandaFieldFormValues,
} from './pandaFieldModel'

const THERMAL_FEM_ENDPOINT = '/api/v1/photoelastic/panda/thermal-fem'
const THERMAL_FEM_FAILED = 'PANDA thermal FEM calculation failed.'
const THERMAL_FEM_MALFORMED =
  'PANDA thermal FEM service returned a malformed response.'
const THERMAL_FEM_UNREACHABLE = 'Unable to reach the PANDA thermal FEM service.'
const THERMAL_FEM_VALIDATION = 'Check the highlighted PANDA thermal FEM values.'

const statusLabels: Record<PandaThermalFemPhase, string> = {
  idle: 'PANDA thermal FEM not calculated',
  loading: 'Calculating PANDA thermal FEM…',
  ready: 'PANDA thermal FEM ready',
  validation: 'PANDA thermal FEM validation issue',
  error: 'PANDA thermal FEM unavailable',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getApiErrorMessage(value: unknown): string | null {
  return isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.message === 'string' &&
    value.error.message.trim().length > 0
    ? value.error.message
    : null
}

export function usePandaThermalFem(
  active: boolean,
  values: PandaFieldFormValues = initialPandaFieldValues,
): PandaThermalFemController {
  const [controls, setControls] = useState<PandaThermalFemControls>(
    initialPandaThermalFemControls,
  )
  const [result, setResult] = useState<PandaThermalFemResult | null>(null)
  const [phase, setPhase] = useState<PandaThermalFemPhase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastAttemptedRequest, setLastAttemptedRequest] =
    useState<PandaThermalFemRequest | null>(null)
  const requestSequence = useRef(0)
  const activeController = useRef<AbortController | null>(null)
  const parsed = useMemo(
    () => parsePandaThermalFemValues(values, controls),
    [controls, values],
  )

  useEffect(() => {
    requestSequence.current += 1
    activeController.current?.abort()
    activeController.current = null
    return () => {
      requestSequence.current += 1
      activeController.current?.abort()
      activeController.current = null
    }
  }, [active, parsed.request])

  const onAxialConditionChange = useCallback(
    (condition: PandaThermalFemAxialCondition) => {
      setControls((current) => ({ ...current, axialCondition: condition }))
    },
    [],
  )

  const onPrescribedForceChange = useCallback((value: string) => {
    setControls((current) => ({ ...current, prescribedForceN: value }))
  }, [])

  const onPrescribedStrainMicrostrainChange = useCallback((value: string) => {
    setControls((current) => ({
      ...current,
      prescribedStrainMicrostrain: value,
    }))
  }, [])

  const onRefinementLevelChange = useCallback(
    (level: PandaThermalFemRefinementLevel) => {
      setControls((current) => ({ ...current, refinementLevel: level }))
    },
    [],
  )

  const onLateralPressureMPaChange = useCallback((value: string) => {
    setControls((current) => ({ ...current, lateralPressureMPa: value }))
  }, [])

  const onWavelengthNmChange = useCallback((value: string) => {
    setControls((current) => ({ ...current, wavelengthNm: value }))
  }, [])

  const onGaussianModeFieldRadiusUmChange = useCallback((value: string) => {
    setControls((current) => ({
      ...current,
      gaussianModeFieldRadiusUm: value,
    }))
  }, [])

  const onTorsionCapabilityChange = useCallback(
    (capability: PandaThermalFemTorsionCapability) => {
      setControls((current) => ({ ...current, torsionCapability: capability }))
    },
    [],
  )

  const onTorsionInputModeChange = useCallback(
    (mode: PandaThermalFemTorsionInputMode) => {
      setControls((current) => ({ ...current, torsionInputMode: mode }))
    },
    [],
  )

  const onTwistRatePerMChange = useCallback((value: string) => {
    setControls((current) => ({ ...current, twistRatePerM: value }))
  }, [])

  const onAppliedTorqueNmChange = useCallback((value: string) => {
    setControls((current) => ({ ...current, appliedTorqueNm: value }))
  }, [])

  const onCalculate = useCallback(() => {
    if (!active || parsed.request === null) {
      setResult(null)
      setPhase(parsed.request === null ? 'validation' : 'idle')
      setErrorMessage(null)
      return
    }

    const request = parsed.request
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    requestSequence.current += 1
    const sequence = requestSequence.current
    setLastAttemptedRequest(request)
    setResult(null)
    setPhase('loading')
    setErrorMessage(null)

    const calculate = async () => {
      try {
        const response = await fetch(THERMAL_FEM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        })
        if (controller.signal.aborted || requestSequence.current !== sequence) {
          return
        }
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null)
          if (
            controller.signal.aborted ||
            requestSequence.current !== sequence
          ) {
            return
          }
          setResult(null)
          setPhase('error')
          setErrorMessage(getApiErrorMessage(body) ?? THERMAL_FEM_FAILED)
          return
        }

        const body: unknown = await response.json().catch(() => null)
        if (controller.signal.aborted || requestSequence.current !== sequence) {
          return
        }
        if (
          !isPandaThermalFemResult(body) ||
          !pandaThermalFemRequestsMatch(request, body.configuration)
        ) {
          setResult(null)
          setPhase('error')
          setErrorMessage(THERMAL_FEM_MALFORMED)
          return
        }
        setResult(body)
        setPhase('ready')
        setErrorMessage(null)
      } catch {
        if (controller.signal.aborted || requestSequence.current !== sequence) {
          return
        }
        setResult(null)
        setPhase('error')
        setErrorMessage(THERMAL_FEM_UNREACHABLE)
      } finally {
        if (activeController.current === controller) {
          activeController.current = null
        }
      }
    }
    void calculate()
  }, [active, parsed.request])

  const onRetry = useCallback(() => {
    onCalculate()
  }, [onCalculate])

  const requestMatches =
    parsed.request !== null &&
    result !== null &&
    pandaThermalFemRequestsMatch(parsed.request, result.configuration)
  const attemptedRequestMatches =
    parsed.request !== null &&
    lastAttemptedRequest !== null &&
    pandaThermalFemRequestsMatch(parsed.request, lastAttemptedRequest)
  const controllerPhase: PandaThermalFemPhase = !active
    ? 'idle'
    : parsed.request === null
      ? 'validation'
      : !attemptedRequestMatches
        ? 'idle'
        : phase
  const controllerErrorMessage =
    parsed.request === null && active
      ? THERMAL_FEM_VALIDATION
      : controllerPhase === 'error'
        ? errorMessage
        : null

  return {
    controls,
    result: active && requestMatches ? result : null,
    phase: controllerPhase,
    statusLabel: statusLabels[controllerPhase],
    errorMessage: controllerErrorMessage,
    fieldErrors: parsed.fieldErrors,
    onAxialConditionChange,
    onPrescribedForceChange,
    onPrescribedStrainMicrostrainChange,
    onRefinementLevelChange,
    onLateralPressureMPaChange,
    onWavelengthNmChange,
    onGaussianModeFieldRadiusUmChange,
    onTorsionCapabilityChange,
    onTorsionInputModeChange,
    onTwistRatePerMChange,
    onAppliedTorqueNmChange,
    onCalculate,
    onRetry,
  }
}
