import type {
  SoftphoneAcsTokenPayload,
  SoftphoneBootstrapPayload,
  SoftphoneCaseDataPayload,
  SoftphoneCaseState,
  SoftphoneExternalEndpointBundle,
  SoftphoneScenarioAccessPreview,
} from '@/features/softphone/types'
import { SOFTPHONE_SESSION_HEADER } from '@/features/softphone/session'

function resolveHttpErrorMessage(status: number) {
  if (status === 401) {
    return 'Your softphone session expired. Refresh the session and try again.'
  }

  if (status === 403) {
    return 'You are not allowed to access this softphone resource.'
  }

  if (status === 404) {
    return 'The requested softphone resource could not be found.'
  }

  if (status >= 500) {
    return 'The softphone service is temporarily unavailable. Try again in a moment.'
  }

  return `Request failed with status ${status}.`
}

function buildSessionHeaders(sessionId?: string, headers?: HeadersInit) {
  const nextHeaders = new Headers(headers)

  if (sessionId) {
    nextHeaders.set(SOFTPHONE_SESSION_HEADER, sessionId)
  }

  return nextHeaders
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit, sessionId?: string): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: buildSessionHeaders(sessionId, init?.headers),
  })

  if (!response.ok) {
    let errorMessage = resolveHttpErrorMessage(response.status)

    try {
      const payload = (await response.json()) as { error?: unknown }
      if (typeof payload.error === 'string' && payload.error.trim()) {
        errorMessage = payload.error.trim()
      }
    } catch {
      // ignore invalid error payloads
    }

    throw new Error(errorMessage)
  }

  return response.json() as Promise<T>
}

export function fetchSoftphoneBootstrap() {
  return fetchJson<SoftphoneBootstrapPayload>('/api/softphone/bootstrap')
}

export function unlockSoftphone(accessKey: string, scenarioId: string) {
  return fetchJson<SoftphoneBootstrapPayload>('/api/softphone/unlock', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ accessKey, scenarioId }),
  })
}

export function fetchSoftphoneScenarioPreview(scenarioId: string) {
  return fetchJson<SoftphoneScenarioAccessPreview>(`/api/softphone/scenario/${scenarioId}`)
}

export function fetchSoftphoneExternalEndpoints(sessionId: string) {
  return fetchJson<SoftphoneExternalEndpointBundle>('/api/softphone/external-endpoints', undefined, sessionId)
}

export function requestSoftphoneAcsToken(profileId: string, sessionId: string) {
  return fetchJson<SoftphoneAcsTokenPayload>('/api/softphone/acs-token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ profileId }),
  }, sessionId)
}

export function setSoftphoneCaseData(payload: SoftphoneCaseDataPayload, sessionId: string) {
  return fetchJson<SoftphoneCaseState>('/api/softphone/case/set', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, sessionId)
}

export function fetchSoftphoneCaseState(sessionId: string) {
  return fetchJson<SoftphoneCaseState>('/api/softphone/case', undefined, sessionId)
}

export function createSoftphoneCaseEventSource() {
  // EventSource cannot send custom headers; the stream is authorized by the
  // HttpOnly session cookie instead of a session id in the URL.
  return new EventSource('/api/softphone/events')
}
