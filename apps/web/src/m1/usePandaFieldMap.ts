import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  initialPandaFieldValues,
  isPandaFieldResult,
  pandaFieldRequestsMatch,
  parsePandaFieldValues,
  type PandaFieldController,
  type PandaFieldDisplay,
  type PandaFieldFormValues,
  type PandaFieldInputName,
  type PandaFieldPhase,
  type PandaFieldResult,
} from './pandaFieldModel'

const FIELD_ENDPOINT = '/api/v1/photoelastic/panda/field-map'
const FIELD_FAILED = 'PANDA field calculation failed.'
const FIELD_MALFORMED = 'PANDA field service returned a malformed response.'
const FIELD_UNREACHABLE = 'Unable to reach the PANDA field service.'
const FIELD_VALIDATION = 'Check the highlighted PANDA field values.'

const statusLabels: Record<PandaFieldPhase, string> = {
  idle: 'PANDA field not calculated',
  loading: 'Calculating PANDA field…',
  ready: 'PANDA field ready',
  validation: 'PANDA field validation issue',
  error: 'PANDA field unavailable',
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

export function usePandaFieldMap(active: boolean): PandaFieldController {
  const [values, setValues] = useState<PandaFieldFormValues>(
    initialPandaFieldValues,
  )
  const [display, setDisplay] = useState<PandaFieldDisplay>('deviatoric')
  const [result, setResult] = useState<PandaFieldResult | null>(null)
  const [phase, setPhase] = useState<PandaFieldPhase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retrySequence, setRetrySequence] = useState(0)
  const requestSequence = useRef(0)
  const lastSuccessfulRetrySequence = useRef(0)
  const parsed = useMemo(() => parsePandaFieldValues(values), [values])

  useEffect(() => {
    requestSequence.current += 1
    const sequence = requestSequence.current

    if (!active) {
      return
    }
    if (parsed.request === null) {
      return
    }

    const request = parsed.request
    const retryRequired = retrySequence !== lastSuccessfulRetrySequence.current
    if (
      result !== null &&
      pandaFieldRequestsMatch(request, result.configuration) &&
      !retryRequired
    ) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setPhase('loading')
      setErrorMessage(null)
      const fetchField = async () => {
        try {
          const response = await fetch(FIELD_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: controller.signal,
          })
          if (
            controller.signal.aborted ||
            requestSequence.current !== sequence
          ) {
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
            setErrorMessage(getApiErrorMessage(body) ?? FIELD_FAILED)
            return
          }

          const body: unknown = await response.json().catch(() => null)
          if (
            controller.signal.aborted ||
            requestSequence.current !== sequence
          ) {
            return
          }
          if (
            !isPandaFieldResult(body) ||
            !pandaFieldRequestsMatch(request, body.configuration)
          ) {
            setResult(null)
            setPhase('error')
            setErrorMessage(FIELD_MALFORMED)
            return
          }

          lastSuccessfulRetrySequence.current = retrySequence
          setResult(body)
          setPhase('ready')
          setErrorMessage(null)
        } catch {
          if (
            controller.signal.aborted ||
            requestSequence.current !== sequence
          ) {
            return
          }
          setResult(null)
          setPhase('error')
          setErrorMessage(FIELD_UNREACHABLE)
        }
      }

      void fetchField()
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [active, parsed, result, retrySequence])

  const onValueChange = useCallback(
    (name: PandaFieldInputName, value: string) => {
      setValues((current) => ({ ...current, [name]: value }))
      setResult(null)
      setPhase('idle')
      setErrorMessage(null)
    },
    [],
  )

  const onDisplayChange = useCallback((nextDisplay: PandaFieldDisplay) => {
    setDisplay(nextDisplay)
  }, [])

  const onRetry = useCallback(() => {
    setResult(null)
    setPhase('loading')
    setErrorMessage(null)
    setRetrySequence((current) => current + 1)
  }, [])

  const controllerPhase: PandaFieldPhase =
    parsed.request === null ? 'validation' : phase
  const controllerErrorMessage =
    parsed.request === null ? FIELD_VALIDATION : errorMessage

  return {
    values,
    display,
    result: parsed.request === null ? null : result,
    phase: controllerPhase,
    statusLabel: statusLabels[controllerPhase],
    errorMessage: controllerErrorMessage,
    fieldErrors: parsed.fieldErrors,
    onValueChange,
    onDisplayChange,
    onRetry,
  }
}
