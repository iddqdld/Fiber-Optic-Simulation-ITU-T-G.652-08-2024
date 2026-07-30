import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  initialPandaFieldValues,
  type PandaFieldFormValues,
} from './pandaFieldModel'
import {
  isPandaMeshResult,
  pandaMeshRequestsMatch,
  parsePandaMeshGeometry,
  type PandaMeshController,
  type PandaMeshPhase,
  type PandaMeshRefinementLevel,
  type PandaMeshRequest,
  type PandaMeshResult,
} from './pandaMeshModel'

const MESH_ENDPOINT = '/api/v1/photoelastic/panda/mesh'
const MESH_FAILED = 'PANDA mesh generation failed.'
const MESH_MALFORMED = 'PANDA mesh service returned a malformed response.'
const MESH_UNREACHABLE = 'Unable to reach the PANDA mesh service.'
const MESH_VALIDATION = 'Check the highlighted PANDA geometry values.'

const statusLabels: Record<PandaMeshPhase, string> = {
  idle: 'PANDA mesh not generated',
  loading: 'Generating PANDA mesh…',
  ready: 'PANDA mesh ready',
  validation: 'PANDA mesh validation issue',
  error: 'PANDA mesh unavailable',
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

export function usePandaMesh(
  active: boolean,
  values: PandaFieldFormValues = initialPandaFieldValues,
): PandaMeshController {
  const [refinementLevel, setRefinementLevel] =
    useState<PandaMeshRefinementLevel>(0)
  const [result, setResult] = useState<PandaMeshResult | null>(null)
  const [phase, setPhase] = useState<PandaMeshPhase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retrySequence, setRetrySequence] = useState(0)
  const [lastAttemptedRequest, setLastAttemptedRequest] =
    useState<PandaMeshRequest | null>(null)
  const requestSequence = useRef(0)
  const lastSuccessfulRetrySequence = useRef(0)
  const parsed = useMemo(() => parsePandaMeshGeometry(values), [values])
  const request = useMemo<PandaMeshRequest | null>(
    () =>
      parsed.request === null
        ? null
        : { ...parsed.request, refinement_level: refinementLevel },
    [parsed.request, refinementLevel],
  )

  useEffect(() => {
    requestSequence.current += 1
    const sequence = requestSequence.current

    if (!active) {
      return
    }
    if (request === null) {
      return
    }

    const retryRequired = retrySequence !== lastSuccessfulRetrySequence.current
    if (
      result !== null &&
      pandaMeshRequestsMatch(request, result.configuration) &&
      !retryRequired
    ) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLastAttemptedRequest(request)
      setPhase('loading')
      setErrorMessage(null)
      const fetchMesh = async () => {
        try {
          const response = await fetch(MESH_ENDPOINT, {
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
            setErrorMessage(getApiErrorMessage(body) ?? MESH_FAILED)
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
            !isPandaMeshResult(body) ||
            !pandaMeshRequestsMatch(request, body.configuration)
          ) {
            setResult(null)
            setPhase('error')
            setErrorMessage(MESH_MALFORMED)
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
          setErrorMessage(MESH_UNREACHABLE)
        }
      }

      void fetchMesh()
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [active, request, result, retrySequence])

  const onRefinementLevelChange = useCallback(
    (level: PandaMeshRefinementLevel) => {
      setRefinementLevel(level)
      setResult(null)
      setPhase('idle')
      setErrorMessage(null)
    },
    [],
  )

  const onRetry = useCallback(() => {
    setResult(null)
    setPhase('loading')
    setErrorMessage(null)
    setRetrySequence((current) => current + 1)
  }, [])

  const visibleResult =
    active &&
    request !== null &&
    result !== null &&
    pandaMeshRequestsMatch(request, result.configuration)
      ? result
      : null
  const attemptedRequestMatches =
    request !== null &&
    lastAttemptedRequest !== null &&
    pandaMeshRequestsMatch(request, lastAttemptedRequest)
  const controllerPhase: PandaMeshPhase = !active
    ? 'idle'
    : request === null
      ? 'validation'
      : phase !== 'idle' && !attemptedRequestMatches
        ? 'idle'
        : phase
  const controllerErrorMessage =
    request === null && active
      ? MESH_VALIDATION
      : controllerPhase === 'error'
        ? errorMessage
        : null

  return {
    refinementLevel,
    result: visibleResult,
    phase: controllerPhase,
    statusLabel: statusLabels[controllerPhase],
    errorMessage: controllerErrorMessage,
    fieldErrors: parsed.fieldErrors,
    onRefinementLevelChange,
    onRetry,
  }
}
