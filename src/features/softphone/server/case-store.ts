import type {
  SoftphoneCaseDataPayload,
  SoftphoneCasePhaseEvent,
  SoftphoneIntentPayload,
  SoftphoneIvrEventEnvelope,
  SoftphoneCaseState,
  SoftphoneTestScenarioRecord,
  SoftphoneTextPayload,
} from '@/features/softphone/types'
import {
  applySoftphoneIvrEventForSession,
  createSoftphoneSession,
  getSoftphoneCaseStateForSession,
  getSoftphoneSession,
  getSoftphoneSessionByCorrelationCode,
  resetSoftphoneSessionsForTests,
  setSoftphoneCaseDataPayloadForSession,
  setSoftphoneCaseDebugInformationPayloadForSession,
  setSoftphoneCaseIntentsPayloadForSession,
  setSoftphoneCasePhasePayloadForSession,
  setSoftphoneCaseIvrRawTextPayloadForSession,
  setSoftphoneCaseIvrRecognizedPayloadForSession,
  patchSoftphoneCaseDataPayloadForSession,
  type SoftphoneSessionRecord,
} from '@/features/softphone/server/session-store'

export function createSoftphoneCaseSession(scenario: SoftphoneTestScenarioRecord) {
  return createSoftphoneSession(scenario)
}

export function getSoftphoneCaseSession(request: Request) {
  return getSoftphoneSession(request)
}

export function getSoftphoneCaseState(request: Request): {
  payload: SoftphoneCaseState
  session: SoftphoneSessionRecord
} | null {
  const session = getSoftphoneCaseSession(request)

  if (session == null) {
    return null
  }

  return {
    payload: getSoftphoneCaseStateForSession(session),
    session,
  }
}

export function getSoftphoneCaseStateByCorrelationCode(correlationCode: string) {
  const session = getSoftphoneSessionByCorrelationCode(correlationCode)

  if (session == null) {
    return null
  }

  return getSoftphoneCaseStateForSession(session)
}

export function setSoftphoneCaseDataPayload(request: Request, payload: SoftphoneCaseDataPayload) {
  const session = getSoftphoneCaseSession(request)

  if (session == null) {
    return null
  }

  return {
    payload: setSoftphoneCaseDataPayloadForSession(session, payload),
    session,
  }
}

export function setSoftphoneCaseDataPayloadForCorrelationCode(
  correlationCode: string,
  payload: SoftphoneCaseDataPayload,
) {
  const session = getSoftphoneSessionByCorrelationCode(correlationCode)

  if (session == null) {
    return null
  }

  return patchSoftphoneCaseDataPayloadForSession(session, payload)
}

export function setSoftphoneCaseDebugInformationPayload(
  request: Request,
  payload: SoftphoneTextPayload,
) {
  const session = getSoftphoneCaseSession(request)

  if (session == null) {
    return null
  }

  return {
    payload: setSoftphoneCaseDebugInformationPayloadForSession(session, payload),
    session,
  }
}

export function setSoftphoneCaseDebugInformationPayloadForCorrelationCode(
  correlationCode: string,
  payload: SoftphoneTextPayload,
) {
  const session = getSoftphoneSessionByCorrelationCode(correlationCode)

  if (session == null) {
    return null
  }

  return setSoftphoneCaseDebugInformationPayloadForSession(session, payload)
}

export function setSoftphoneCaseIntentsPayloadForCorrelationCode(
  correlationCode: string,
  payload: SoftphoneIntentPayload,
) {
  const session = getSoftphoneSessionByCorrelationCode(correlationCode)

  if (session == null) {
    return null
  }

  return setSoftphoneCaseIntentsPayloadForSession(session, payload)
}

export function setSoftphoneCasePhasePayload(request: Request, payload: SoftphoneCasePhaseEvent) {
  const session = getSoftphoneCaseSession(request)

  if (session == null) {
    return null
  }

  return {
    payload: setSoftphoneCasePhasePayloadForSession(session, payload),
    session,
  }
}

export function setSoftphoneCasePhasePayloadForCorrelationCode(
  correlationCode: string,
  payload: SoftphoneCasePhaseEvent,
) {
  const session = getSoftphoneSessionByCorrelationCode(correlationCode)

  if (session == null) {
    return null
  }

  return setSoftphoneCasePhasePayloadForSession(session, payload)
}

export function setSoftphoneCaseIvrRawTextPayload(request: Request, payload: SoftphoneTextPayload) {
  const session = getSoftphoneCaseSession(request)

  if (session == null) {
    return null
  }

  return {
    payload: setSoftphoneCaseIvrRawTextPayloadForSession(session, payload),
    session,
  }
}

export function setSoftphoneCaseIvrRawTextPayloadForCorrelationCode(
  correlationCode: string,
  payload: SoftphoneTextPayload,
) {
  const session = getSoftphoneSessionByCorrelationCode(correlationCode)

  if (session == null) {
    return null
  }

  return setSoftphoneCaseIvrRawTextPayloadForSession(session, payload)
}

export function setSoftphoneCaseIvrRecognizedPayload(
  request: Request,
  payload: SoftphoneCaseDataPayload,
) {
  const session = getSoftphoneCaseSession(request)

  if (session == null) {
    return null
  }

  return {
    payload: setSoftphoneCaseIvrRecognizedPayloadForSession(session, payload),
    session,
  }
}

export function setSoftphoneCaseIvrRecognizedPayloadForCorrelationCode(
  correlationCode: string,
  payload: SoftphoneCaseDataPayload,
) {
  const session = getSoftphoneSessionByCorrelationCode(correlationCode)

  if (session == null) {
    return null
  }

  return setSoftphoneCaseIvrRecognizedPayloadForSession(session, payload)
}

export function applySoftphoneIvrEventForCorrelationCode(
  correlationCode: string,
  payload: SoftphoneIvrEventEnvelope,
) {
  const session = getSoftphoneSessionByCorrelationCode(correlationCode)

  if (session == null) {
    return null
  }

  return applySoftphoneIvrEventForSession(session, payload)
}

export function resetSoftphoneCaseStateForTests() {
  resetSoftphoneSessionsForTests()
}
