import type {
  SoftphoneCaseDataPayload,
  SoftphoneCasePhaseEvent,
  SoftphoneFieldMetadataMap,
  SoftphoneCaseState,
  SoftphoneIntentPayload,
  SoftphoneIvrEventEnvelope,
  SoftphoneMetadataValues,
  SoftphoneTestScenarioRecord,
  SoftphoneTextPayload,
} from '@/features/softphone/types'
import { SOFTPHONE_SESSION_HEADER } from '@/features/softphone/session'
import { secureRandomDigits } from '@/lib/secure-random'
import {
  describeCasePayload,
  describePhaseEvent,
  describeTextPayload,
  logSoftphoneInfo,
  logSoftphoneWarn,
} from '@/features/softphone/server/log'
import { publishSoftphoneCaseState, resetSoftphoneCaseEventBrokerForTests } from '@/features/softphone/server/events'

export const SOFTPHONE_SESSION_COOKIE_NAME = 'contoso-softphone-session'
const SOFTPHONE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
const SOFTPHONE_SESSION_TTL_MS = SOFTPHONE_SESSION_TTL_SECONDS * 1000
const SOFTPHONE_SESSION_SWEEP_INTERVAL_MS = 10 * 60 * 1000
const SOFTPHONE_CORRELATION_CODE_SPACE = 10_000
const SOFTPHONE_SESSION_STORE_KEY = '__contosoSoftphoneSessions'
const SOFTPHONE_SESSION_CODE_INDEX_KEY = '__contosoSoftphoneSessionCodeIndex'
const SOFTPHONE_SESSION_SWEEP_TIMER_KEY = '__contosoSoftphoneSessionSweepTimer'

type SoftphoneAcsSessionRecord = {
  communicationUserId: string
  expiresAt: number
  profileId: string
  token: string
}

export type SoftphoneSessionRecord = {
  acsSession: SoftphoneAcsSessionRecord | null
  caseState: SoftphoneCaseState
  correlationCode: string
  lastSeenAt: number
  scenario: SoftphoneTestScenarioRecord
  sessionId: string
}

type SoftphoneGlobalSessionStore = typeof globalThis & {
  [SOFTPHONE_SESSION_STORE_KEY]?: Map<string, SoftphoneSessionRecord>
  [SOFTPHONE_SESSION_CODE_INDEX_KEY]?: Set<string>
  [SOFTPHONE_SESSION_SWEEP_TIMER_KEY]?: ReturnType<typeof setInterval>
}

function cloneValue<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T
}

function createDefaultCaseState(): SoftphoneCaseState {
  return {
    caseData: null,
    debugInformation: null,
    intents: [],
    ivrRawText: null,
    phaseEvents: [],
    recognizedData: null,
    updatedAt: null,
  }
}

function getSessionStore() {
  const softphoneGlobal = globalThis as SoftphoneGlobalSessionStore

  if (softphoneGlobal[SOFTPHONE_SESSION_STORE_KEY] == null) {
    softphoneGlobal[SOFTPHONE_SESSION_STORE_KEY] = new Map<string, SoftphoneSessionRecord>()
    ensureSessionSweepScheduled()
  }

  return softphoneGlobal[SOFTPHONE_SESSION_STORE_KEY] as Map<string, SoftphoneSessionRecord>
}

function getCorrelationCodeIndex() {
  const softphoneGlobal = globalThis as SoftphoneGlobalSessionStore

  if (softphoneGlobal[SOFTPHONE_SESSION_CODE_INDEX_KEY] == null) {
    softphoneGlobal[SOFTPHONE_SESSION_CODE_INDEX_KEY] = new Set<string>()
  }

  return softphoneGlobal[SOFTPHONE_SESSION_CODE_INDEX_KEY] as Set<string>
}

function ensureSessionSweepScheduled() {
  const softphoneGlobal = globalThis as SoftphoneGlobalSessionStore

  if (softphoneGlobal[SOFTPHONE_SESSION_SWEEP_TIMER_KEY] != null) {
    return
  }

  const timer = setInterval(() => {
    pruneExpiredSoftphoneSessions()
  }, SOFTPHONE_SESSION_SWEEP_INTERVAL_MS)

  // Don't let the sweep timer keep the process alive on its own.
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref()
  }

  softphoneGlobal[SOFTPHONE_SESSION_SWEEP_TIMER_KEY] = timer
}

function isSessionExpired(session: SoftphoneSessionRecord, now: number) {
  return now - session.lastSeenAt > SOFTPHONE_SESSION_TTL_MS
}

function removeSession(sessionId: string) {
  const sessionStore = getSessionStore()
  const session = sessionStore.get(sessionId)

  if (session == null) {
    return
  }

  sessionStore.delete(sessionId)
  getCorrelationCodeIndex().delete(session.correlationCode)
}

function resolveLiveSession(sessionId: string) {
  const session = getSessionStore().get(sessionId)

  if (session == null) {
    return null
  }

  const now = Date.now()

  if (isSessionExpired(session, now)) {
    removeSession(sessionId)
    return null
  }

  session.lastSeenAt = now
  return session
}

export function pruneExpiredSoftphoneSessions(now = Date.now()) {
  const sessionStore = getSessionStore()
  let removed = 0

  for (const [sessionId, session] of sessionStore) {
    if (isSessionExpired(session, now)) {
      removeSession(sessionId)
      removed += 1
    }
  }

  return removed
}

function resolveSessionLogDetails(session: SoftphoneSessionRecord) {
  return {
    correlationCode: session.correlationCode,
    hasCaseData: session.caseState.caseData != null,
    scenarioId: session.scenario.id,
    sessionId: session.sessionId,
    storeSize: getSessionStore().size,
    updatedAt: session.caseState.updatedAt,
  }
}

function touchState(state: SoftphoneCaseState) {
  state.updatedAt = new Date().toISOString()
}

function buildSessionRecord(sessionId: string, scenario: SoftphoneTestScenarioRecord): SoftphoneSessionRecord {
  return {
    acsSession: null,
    caseState: createDefaultCaseState(),
    correlationCode: generateUniqueCorrelationCode(),
    lastSeenAt: Date.now(),
    scenario: cloneValue(scenario),
    sessionId,
  }
}

function resolveRandomCorrelationCode() {
  return secureRandomDigits(4)
}

function generateUniqueCorrelationCode() {
  // Reclaim any expired sessions first so codes free up before we look for one.
  pruneExpiredSoftphoneSessions()

  const codeIndex = getCorrelationCodeIndex()

  if (codeIndex.size >= SOFTPHONE_CORRELATION_CODE_SPACE) {
    throw new Error('Unable to allocate a unique softphone correlation code.')
  }

  for (let attempt = 0; attempt < SOFTPHONE_CORRELATION_CODE_SPACE; attempt += 1) {
    const nextCode = resolveRandomCorrelationCode()

    if (!codeIndex.has(nextCode)) {
      return nextCode
    }
  }

  throw new Error('Unable to allocate a unique softphone correlation code.')
}

function publishSessionState(session: SoftphoneSessionRecord) {
  session.lastSeenAt = Date.now()
  const nextState = getSoftphoneCaseStateForSession(session)
  publishSoftphoneCaseState(session.sessionId, nextState)
  return nextState
}

function mergeCaseDataPayload(
  currentPayload: SoftphoneCaseDataPayload | null,
  payload: SoftphoneCaseDataPayload,
): SoftphoneCaseDataPayload {
  return {
    metadata: mergeFieldMetadataMap(currentPayload?.metadata, payload.metadata),
    values: {
      ...(currentPayload?.values ?? {}),
      ...cloneValue(payload.values),
    },
  }
}

function mergeMetadataValues(
  currentPayload?: SoftphoneMetadataValues,
  payload?: SoftphoneMetadataValues,
): SoftphoneMetadataValues | undefined {
  if (currentPayload == null && payload == null) {
    return undefined
  }

  return {
    values: {
      ...(currentPayload?.values ?? {}),
      ...(payload != null ? cloneValue(payload.values) : {}),
    },
  }
}

function mergeFieldMetadataMap(
  currentPayload?: SoftphoneFieldMetadataMap,
  payload?: SoftphoneFieldMetadataMap,
): SoftphoneFieldMetadataMap | undefined {
  if (currentPayload == null && payload == null) {
    return undefined
  }

  const fieldIds = new Set([
    ...Object.keys(currentPayload ?? {}),
    ...Object.keys(payload ?? {}),
  ])
  const mergedEntries = Array.from(fieldIds)
    .map((fieldId) => {
      const metadata = mergeMetadataValues(currentPayload?.[fieldId], payload?.[fieldId])
      return metadata == null ? null : [fieldId, metadata] as const
    })
    .filter((entry): entry is readonly [string, SoftphoneMetadataValues] => entry != null)

  return mergedEntries.length > 0 ? Object.fromEntries(mergedEntries) : undefined
}

export function resolveSoftphoneSessionIdFromCookie(request: Request) {
  return resolveCookieValue(request.headers.get('cookie'), SOFTPHONE_SESSION_COOKIE_NAME)
}

export function resolveSoftphoneSessionIdFromHeader(request: Request) {
  return request.headers.get(SOFTPHONE_SESSION_HEADER)?.trim() ?? ''
}

export function resolveCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return ''
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    ?.trim() ?? ''
}

export function buildSoftphoneSessionSetCookieValue(sessionId: string) {
  const baseValue = `${SOFTPHONE_SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Max-Age=${SOFTPHONE_SESSION_TTL_SECONDS}; Path=/`

  if (process.env.NODE_ENV === 'production') {
    return `${baseValue}; SameSite=None; Secure`
  }

  return `${baseValue}; SameSite=Lax`
}

export function createSoftphoneSession(scenario: SoftphoneTestScenarioRecord): {
  headers: Headers
  session: SoftphoneSessionRecord
} {
  const sessionStore = getSessionStore()
  const sessionId = crypto.randomUUID()
  const headers = new Headers()
  const session = buildSessionRecord(sessionId, scenario)

  sessionStore.set(sessionId, session)
  getCorrelationCodeIndex().add(session.correlationCode)
  headers.set('set-cookie', buildSoftphoneSessionSetCookieValue(sessionId))
  logSoftphoneInfo('session.created', resolveSessionLogDetails(session))

  return {
    headers,
    session,
  }
}

export function getSoftphoneSession(request: Request) {
  const headerSessionId = resolveSoftphoneSessionIdFromHeader(request)
  const cookieSessionId = resolveSoftphoneSessionIdFromCookie(request)
  const sessionId = headerSessionId || cookieSessionId
  const url = new URL(request.url)

  if (!sessionId) {
    logSoftphoneWarn('session.lookup.missed', {
      hasCookieHeader: request.headers.has('cookie'),
      hasSessionHeader: request.headers.has(SOFTPHONE_SESSION_HEADER),
      method: request.method,
      path: url.pathname,
      reason: 'missing-session-id',
    })
    return null
  }

  const session = resolveLiveSession(sessionId)

  if (session == null) {
    logSoftphoneWarn('session.lookup.missed', {
      hasCookieHeader: request.headers.has('cookie'),
      hasSessionHeader: request.headers.has(SOFTPHONE_SESSION_HEADER),
      method: request.method,
      path: url.pathname,
      reason: 'unknown-session-id',
      sessionId,
      sessionIdSource: headerSessionId ? 'header' : 'cookie',
      storeSize: getSessionStore().size,
    })
    return null
  }

  return session
}

export function resolveSoftphoneSessionFromRequestHeaders(headers: Headers) {
  const headerSessionId = headers.get(SOFTPHONE_SESSION_HEADER)?.trim() ?? ''
  const cookieSessionId = resolveCookieValue(headers.get('cookie'), SOFTPHONE_SESSION_COOKIE_NAME)
  const sessionId = headerSessionId || cookieSessionId

  return sessionId ? resolveLiveSession(sessionId) : null
}

export function getSoftphoneSessionByCorrelationCode(correlationCode: string) {
  const normalizedCode = correlationCode.trim()

  if (!/^\d{4}$/.test(normalizedCode)) {
    return null
  }

  const now = Date.now()

  for (const [sessionId, session] of getSessionStore()) {
    if (session.correlationCode !== normalizedCode) {
      continue
    }

    if (isSessionExpired(session, now)) {
      removeSession(sessionId)
      return null
    }

    session.lastSeenAt = now
    return session
  }

  return null
}

export function getSoftphoneSessionById(sessionId: string) {
  const normalizedSessionId = sessionId.trim()

  if (!normalizedSessionId) {
    return null
  }

  return resolveLiveSession(normalizedSessionId)
}

export function getSoftphoneCaseStateForSession(session: SoftphoneSessionRecord): SoftphoneCaseState {
  return cloneValue(session.caseState)
}

export function setSoftphoneCaseDataPayloadForSession(
  session: SoftphoneSessionRecord,
  payload: SoftphoneCaseDataPayload,
) {
  session.caseState.caseData = cloneValue(payload)
  session.caseState.debugInformation = null
  session.caseState.intents = []
  session.caseState.ivrRawText = null
  session.caseState.phaseEvents = []
  session.caseState.recognizedData = null
  touchState(session.caseState)
  logSoftphoneInfo('case.updated', {
    ...resolveSessionLogDetails(session),
    payload: describeCasePayload(payload),
  })
  return publishSessionState(session)
}

export function patchSoftphoneCaseDataPayloadForSession(
  session: SoftphoneSessionRecord,
  payload: SoftphoneCaseDataPayload,
) {
  session.caseState.caseData = mergeCaseDataPayload(session.caseState.caseData, payload)
  touchState(session.caseState)
  logSoftphoneInfo('case.patch.updated', {
    ...resolveSessionLogDetails(session),
    payload: describeCasePayload(payload),
  })
  return publishSessionState(session)
}

export function setSoftphoneCasePhasePayloadForSession(
  session: SoftphoneSessionRecord,
  payload: SoftphoneCasePhaseEvent,
) {
  const existingPhaseIndex = session.caseState.phaseEvents.findIndex((event) => event.phaseId === payload.phaseId)
  const nextPayload = cloneValue(payload)

  if (existingPhaseIndex >= 0) {
    const currentPayload = session.caseState.phaseEvents[existingPhaseIndex]
    session.caseState.phaseEvents[existingPhaseIndex] = {
      ...nextPayload,
      metadata: mergeMetadataValues(currentPayload?.metadata, nextPayload.metadata),
    }
  } else {
    session.caseState.phaseEvents.push(nextPayload)
  }

  touchState(session.caseState)
  logSoftphoneInfo('case.phase.updated', {
    ...resolveSessionLogDetails(session),
    payload: describePhaseEvent(payload),
  })
  return publishSessionState(session)
}

export function setSoftphoneCaseDebugInformationPayloadForSession(
  session: SoftphoneSessionRecord,
  payload: SoftphoneTextPayload,
) {
  session.caseState.debugInformation = cloneValue(payload)
  touchState(session.caseState)
  logSoftphoneInfo('case.debug-information.updated', {
    ...resolveSessionLogDetails(session),
    payload: describeTextPayload(payload),
  })
  return publishSessionState(session)
}

export function setSoftphoneCaseIntentsPayloadForSession(
  session: SoftphoneSessionRecord,
  payload: SoftphoneIntentPayload,
) {
  session.caseState.intents = cloneValue(payload.intents)
  touchState(session.caseState)
  logSoftphoneInfo('case.intent.updated', {
    ...resolveSessionLogDetails(session),
    count: payload.intents.length,
    intents: payload.intents,
  })
  return publishSessionState(session)
}

export function setSoftphoneCaseIvrRawTextPayloadForSession(
  session: SoftphoneSessionRecord,
  payload: SoftphoneTextPayload,
) {
  session.caseState.ivrRawText = cloneValue(payload)
  touchState(session.caseState)
  logSoftphoneInfo('case.ivr-raw-text.updated', {
    ...resolveSessionLogDetails(session),
    payload: describeTextPayload(payload),
  })
  return publishSessionState(session)
}

export function setSoftphoneCaseIvrRecognizedPayloadForSession(
  session: SoftphoneSessionRecord,
  payload: SoftphoneCaseDataPayload,
) {
  session.caseState.recognizedData = mergeCaseDataPayload(session.caseState.recognizedData, payload)
  touchState(session.caseState)
  logSoftphoneInfo('case.ivr-recognized.updated', {
    ...resolveSessionLogDetails(session),
    payload: describeCasePayload(payload),
  })
  return publishSessionState(session)
}

export function applySoftphoneIvrEventForSession(
  session: SoftphoneSessionRecord,
  payload: SoftphoneIvrEventEnvelope,
) {
  if (payload.type === 'case_data') {
    return patchSoftphoneCaseDataPayloadForSession(session, payload.data)
  }

  if (payload.type === 'debug') {
    return setSoftphoneCaseDebugInformationPayloadForSession(session, payload.data)
  }

  if (payload.type === 'intent') {
    return setSoftphoneCaseIntentsPayloadForSession(session, payload.data)
  }

  if (payload.type === 'phase') {
    return setSoftphoneCasePhasePayloadForSession(session, {
      phaseId: payload.data.phaseId,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    })
  }

  if (payload.type === 'raw_text') {
    return setSoftphoneCaseIvrRawTextPayloadForSession(session, payload.data)
  }

  return setSoftphoneCaseIvrRecognizedPayloadForSession(session, payload.data)
}

export function getSoftphoneAcsSessionForSession(session: SoftphoneSessionRecord) {
  return session.acsSession == null ? null : { ...session.acsSession }
}

export function setSoftphoneAcsSessionForSession(
  session: SoftphoneSessionRecord,
  nextAcsSession: SoftphoneAcsSessionRecord,
) {
  session.acsSession = { ...nextAcsSession }
}

export function resetSoftphoneSessionsForTests() {
  const softphoneGlobal = globalThis as SoftphoneGlobalSessionStore

  getSessionStore().clear()
  getCorrelationCodeIndex().clear()

  const timer = softphoneGlobal[SOFTPHONE_SESSION_SWEEP_TIMER_KEY]

  if (timer != null) {
    clearInterval(timer)
    delete softphoneGlobal[SOFTPHONE_SESSION_SWEEP_TIMER_KEY]
  }

  resetSoftphoneCaseEventBrokerForTests()
}
