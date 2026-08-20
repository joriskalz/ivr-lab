import { beforeEach, describe, expect, test } from 'bun:test'
import type { SoftphoneCaseState } from '@/features/softphone/types'
import { createDefaultSoftphoneScenario } from '@/features/softphone/scenario'
import {
  createSoftphoneCaseSession,
  getSoftphoneCaseState,
  getSoftphoneCaseStateByCorrelationCode,
  resetSoftphoneCaseStateForTests,
  setSoftphoneCaseDataPayload,
  setSoftphoneCaseDebugInformationPayloadForCorrelationCode,
  setSoftphoneCasePhasePayloadForCorrelationCode,
  setSoftphoneCaseIvrRawTextPayloadForCorrelationCode,
  setSoftphoneCaseIvrRecognizedPayloadForCorrelationCode,
} from '@/features/softphone/server/case-store'
import { subscribeToSoftphoneCaseState } from '@/features/softphone/server/events'

function resolveCookieHeader(headers: Headers) {
  const setCookie = headers.get('set-cookie')

  if (setCookie == null) {
    throw new Error('Expected set-cookie header to be present.')
  }

  return setCookie
}

function buildRequest(cookie?: string) {
  return new Request('http://localhost/api/softphone/case', {
    headers: cookie == null ? undefined : { cookie },
  })
}

describe('softphone case store', () => {
  beforeEach(() => {
    resetSoftphoneCaseStateForTests()
  })

  test('does not create a browser session for an unauthenticated read', () => {
    expect(getSoftphoneCaseState(buildRequest())).toBeNull()
  })

  test('starts empty for an existing browser session and keeps one 4-digit correlation code', () => {
    const sessionResult = createSoftphoneCaseSession(createDefaultSoftphoneScenario())
    const cookie = resolveCookieHeader(sessionResult.headers)
    const result = getSoftphoneCaseState(buildRequest(cookie))

    if (result == null) {
      throw new Error('Expected case state result.')
    }

    expect(result.payload).toEqual({
      caseData: null,
      debugInformation: null,
      intents: [],
      ivrRawText: null,
      phaseEvents: [],
      recognizedData: null,
      updatedAt: null,
    })
    expect(result.session.correlationCode).toBe(sessionResult.session.correlationCode)
  })

  test('keeps state isolated across browser sessions', () => {
    const firstSession = createSoftphoneCaseSession(createDefaultSoftphoneScenario())
    const secondSession = createSoftphoneCaseSession(createDefaultSoftphoneScenario())

    expect(firstSession.session.correlationCode).not.toBe(secondSession.session.correlationCode)

    const firstCookie = resolveCookieHeader(firstSession.headers)
    const secondCookie = resolveCookieHeader(secondSession.headers)

    setSoftphoneCaseDataPayload(buildRequest(firstCookie), {
      values: {
        aktenzeichen: 'D123456789012',
        case_status: 'active',
        geburtsdatum: '15.03.1985',
        hausnummer: '2a',
        nachname: 'Kalz',
        ort: 'Hamburg',
        plz: '20095',
        strasse: 'Spitalerstrasse',
        vorname: 'Joris',
      },
    })

    const firstState = getSoftphoneCaseState(buildRequest(firstCookie))
    const secondState = getSoftphoneCaseState(buildRequest(secondCookie))

    expect(firstState?.payload.caseData?.values.aktenzeichen).toBe('D123456789012')
    expect(secondState?.payload.caseData).toBeNull()
  })

  test('routes IVR feedback updates through the correlation code', () => {
    const firstSession = createSoftphoneCaseSession(createDefaultSoftphoneScenario())
    const secondSession = createSoftphoneCaseSession(createDefaultSoftphoneScenario())

    setSoftphoneCaseIvrRawTextPayloadForCorrelationCode(firstSession.session.correlationCode, { text: 'hello world' })
    setSoftphoneCaseDebugInformationPayloadForCorrelationCode(firstSession.session.correlationCode, { text: 'topic: MainTopic' })
    setSoftphoneCasePhasePayloadForCorrelationCode(firstSession.session.correlationCode, {
      metadata: {
        values: {
          confidence: 'high',
        },
      },
      phaseId: 'case_id_collection',
      timestamp: '2026-03-12T18:15:00.000Z',
    })
    setSoftphoneCaseIvrRecognizedPayloadForCorrelationCode(firstSession.session.correlationCode, {
      metadata: {
        ort: {
          values: {
            isMatch: true,
            score: 100,
          },
        },
      },
      values: {
        aktenzeichen: 'D123',
        nachname: 'Schmidt',
        ort: 'Berlin',
        strasse: 'Invalidenstrasse',
        vorname: 'Anna',
      },
    })

    const firstState = getSoftphoneCaseStateByCorrelationCode(firstSession.session.correlationCode)
    const secondState = getSoftphoneCaseStateByCorrelationCode(secondSession.session.correlationCode)

    expect(firstState?.ivrRawText?.text).toBe('hello world')
    expect(firstState?.debugInformation?.text).toBe('topic: MainTopic')
    expect(firstState?.phaseEvents).toEqual([
      {
        metadata: {
          values: {
            confidence: 'high',
          },
        },
        phaseId: 'case_id_collection',
        timestamp: '2026-03-12T18:15:00.000Z',
      },
    ])
    expect(firstState?.recognizedData?.values.ort).toBe('Berlin')
    expect(firstState?.recognizedData?.metadata?.ort?.values.score).toBe(100)
    expect(secondState?.ivrRawText).toBeNull()
    expect(secondState?.debugInformation).toBeNull()
    expect(secondState?.phaseEvents).toEqual([])
    expect(secondState?.recognizedData).toBeNull()
  })

  test('publishes full case state updates to session subscribers', () => {
    const sessionResult = createSoftphoneCaseSession(createDefaultSoftphoneScenario())
    const receivedStates: SoftphoneCaseState[] = []
    const unsubscribe = subscribeToSoftphoneCaseState(sessionResult.session.sessionId, (caseState) => {
      receivedStates.push(caseState)
    })

    setSoftphoneCaseIvrRawTextPayloadForCorrelationCode(sessionResult.session.correlationCode, { text: 'hello world' })
    setSoftphoneCasePhasePayloadForCorrelationCode(sessionResult.session.correlationCode, {
      metadata: {
        values: {
          score: 40,
        },
      },
      phaseId: 'privacy_opt_in',
      timestamp: '2026-03-12T18:16:00.000Z',
    })
    setSoftphoneCasePhasePayloadForCorrelationCode(sessionResult.session.correlationCode, {
      metadata: {
        values: {
          isMatch: true,
        },
      },
      phaseId: 'privacy_opt_in',
      timestamp: '2026-03-12T18:16:05.000Z',
    })
    setSoftphoneCaseDebugInformationPayloadForCorrelationCode(sessionResult.session.correlationCode, { text: 'topic: MainTopic' })
    unsubscribe()
    setSoftphoneCaseIvrRecognizedPayloadForCorrelationCode(sessionResult.session.correlationCode, {
      values: {
        aktenzeichen: 'D123',
        case_status: 'active',
        nachname: 'Schmidt',
        ort: 'Berlin',
        strasse: 'Invalidenstrasse',
        vorname: 'Anna',
      },
    })

    expect(receivedStates).toHaveLength(4)
    expect(receivedStates[0]?.ivrRawText?.text).toBe('hello world')
    expect(receivedStates[0]?.debugInformation).toBeNull()
    expect(receivedStates[1]?.phaseEvents).toEqual([
      {
        metadata: {
          values: {
            score: 40,
          },
        },
        phaseId: 'privacy_opt_in',
        timestamp: '2026-03-12T18:16:00.000Z',
      },
    ])
    expect(receivedStates[2]?.phaseEvents).toEqual([
      {
        metadata: {
          values: {
            isMatch: true,
            score: 40,
          },
        },
        phaseId: 'privacy_opt_in',
        timestamp: '2026-03-12T18:16:05.000Z',
      },
    ])
    expect(receivedStates[3]?.ivrRawText?.text).toBe('hello world')
    expect(receivedStates[3]?.debugInformation?.text).toBe('topic: MainTopic')
    expect(receivedStates[3]?.updatedAt).not.toBeNull()
  })

  test('merges recognized field metadata across multiple updates', () => {
    const sessionResult = createSoftphoneCaseSession(createDefaultSoftphoneScenario())

    setSoftphoneCaseIvrRecognizedPayloadForCorrelationCode(sessionResult.session.correlationCode, {
      metadata: {
        vorname: {
          values: {
            score: 83,
          },
        },
      },
      values: {
        vorname: 'Anna',
      },
    })
    setSoftphoneCaseIvrRecognizedPayloadForCorrelationCode(sessionResult.session.correlationCode, {
      metadata: {
        vorname: {
          values: {
            isMatch: true,
          },
        },
      },
      values: {},
    })

    const state = getSoftphoneCaseStateByCorrelationCode(sessionResult.session.correlationCode)

    expect(state?.recognizedData?.values.vorname).toBe('Anna')
    expect(state?.recognizedData?.metadata?.vorname?.values).toEqual({
      isMatch: true,
      score: 83,
    })
  })
})
