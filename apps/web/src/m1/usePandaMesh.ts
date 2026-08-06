import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  isPandaMeshResult,
  pandaMeshRequestsMatch,
  parsePandaMeshGeometry,
  type PandaMeshController,
  type PandaMeshFieldErrors,
  type PandaMeshPhase,
  type PandaMeshRefinementLevel,
  type PandaMeshRequest,
  type PandaMeshResult,
} from './pandaMeshModel'
import type { PandaFieldFormValues } from './pandaFieldModel'

const PANDA_MESH_ENDPOINT = '/api/v1/photoelastic/panda/mesh'
const PANDA_MESH_VALIDATION_MESSAGE =
  'Check the highlighted PANDA geometry values.'
const PANDA_MESH_MALFORMED_MESSAGE =
  'PANDA mesh service returned a malformed response.'
const PANDA_MESH_ERROR_MESSAGE = 'PANDA mesh generation failed.'
const PANDA_MESH_NETWORK_MESSAGE = 'Unable to reach the PANDA mesh service.'

const PANDA_MESH_STATUS_LABELS: Record<PandaMeshPhase, string> = {
  idle: 'Mesh idle',
  loading: 'Generating mesh',
  ready: 'Mesh ready',
  validation: 'Mesh input needs attention',
  error: 'Mesh generation failed',
}

export type PandaMeshHookResult = Pick<
  PandaMeshController,
  | 'refinementLevel'
  | 'result'
  | 'phase'
  | 'statusLabel'
  | 'errorMessage'
  | 'fieldErrors'
  | 'onRetry'
>

type PandaMeshState = {
  phase: PandaMeshPhase
  result: PandaMeshResult | null
  errorMessage: string | null
  requestKey: string | null
  retrySequence: number
}

function getApiErrorMessage(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('detail' in value)) {
    return null
  }

  const detail = value.detail
  if (typeof detail === 'string' && detail.trim() !== '') {
    return detail
  }

  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => {
      if (typeof item === 'string' && item.trim() !== '') {
        return [item]
      }
      if (
        typeof item === 'object' &&
        item !== null &&
        'msg' in item &&
        typeof item.msg === 'string'
      ) {
        return [item.msg]
      }
      return []
    })
    if (messages.length > 0) {
      return messages.join('; ')
    }
  }

  return null
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function usePandaMesh(
  active: boolean,
  values: PandaFieldFormValues,
  refinementLevel: PandaMeshRefinementLevel,
): PandaMeshHookResult {
  const parsedGeometry = useMemo(() => parsePandaMeshGeometry(values), [values])
  const request = useMemo<PandaMeshRequest | null>(() => {
    if (parsedGeometry.request === null) {
      return null
    }
    return {
      ...parsedGeometry.request,
      refinement_level: refinementLevel,
    }
  }, [parsedGeometry.request, refinementLevel])

  const requestKey = useMemo(
    () => (request === null ? null : JSON.stringify(request)),
    [request],
  )
  const [meshState, setMeshState] = useState<PandaMeshState>({
    phase: 'idle',
    result: null,
    errorMessage: null,
    requestKey: null,
    retrySequence: 0,
  })
  const [retrySequence, setRetrySequence] = useState(0)
  const activeController = useRef<AbortController | null>(null)
  const requestSequence = useRef(0)
  const successfulRequest = useRef<{
    requestKey: string
    retrySequence: number
  } | null>(null)

  const onRetry = useCallback(() => {
    setRetrySequence((sequence) => sequence + 1)
  }, [])

  useEffect(() => {
    requestSequence.current += 1
    const sequence = requestSequence.current
    activeController.current?.abort()
    activeController.current = null

    if (!active) {
      return
    }

    if (request === null) {
      return
    }
    if (
      successfulRequest.current?.requestKey === requestKey &&
      successfulRequest.current.retrySequence === retrySequence
    ) {
      return
    }

    const controller = new AbortController()
    activeController.current = controller

    void fetch(PANDA_MESH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
      .then(async (response) => {
        let body: unknown
        try {
          body = await response.json()
        } catch {
          body = null
        }

        if (controller.signal.aborted || requestSequence.current !== sequence) {
          return
        }

        if (!response.ok) {
          throw new Error(getApiErrorMessage(body) ?? PANDA_MESH_ERROR_MESSAGE)
        }

        if (
          !isPandaMeshResult(body) ||
          !pandaMeshRequestsMatch(request, body.configuration)
        ) {
          throw new Error(PANDA_MESH_MALFORMED_MESSAGE)
        }

        successfulRequest.current = {
          requestKey: requestKey ?? JSON.stringify(request),
          retrySequence,
        }
        setMeshState({
          phase: 'ready',
          result: body,
          errorMessage: null,
          requestKey,
          retrySequence,
        })
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          requestSequence.current !== sequence ||
          isAbortError(error)
        ) {
          return
        }
        setMeshState({
          phase: 'error',
          result: null,
          errorMessage:
            error instanceof Error ? error.message : PANDA_MESH_NETWORK_MESSAGE,
          requestKey,
          retrySequence,
        })
      })
      .finally(() => {
        if (activeController.current === controller) {
          activeController.current = null
        }
      })

    return () => {
      requestSequence.current += 1
      controller.abort()
      if (activeController.current === controller) {
        activeController.current = null
      }
    }
  }, [active, request, requestKey, retrySequence])

  const hasCurrentState =
    request !== null &&
    meshState.requestKey === requestKey &&
    meshState.retrySequence === retrySequence
  const visiblePhase: PandaMeshPhase = !active
    ? 'idle'
    : request === null
      ? 'validation'
      : hasCurrentState
        ? meshState.phase
        : 'loading'
  const visibleErrorMessage = !active
    ? null
    : request === null
      ? PANDA_MESH_VALIDATION_MESSAGE
      : hasCurrentState
        ? meshState.errorMessage
        : null
  const fieldErrors: PandaMeshFieldErrors = parsedGeometry.fieldErrors
  const requestMatchesResult =
    request !== null &&
    hasCurrentState &&
    meshState.result !== null &&
    pandaMeshRequestsMatch(request, meshState.result.configuration)

  return {
    refinementLevel,
    result:
      requestMatchesResult && visiblePhase === 'ready'
        ? meshState.result
        : null,
    phase: visiblePhase,
    statusLabel: PANDA_MESH_STATUS_LABELS[visiblePhase],
    errorMessage: visibleErrorMessage,
    fieldErrors,
    onRetry,
  }
}
