import { describe, expect, test } from 'bun:test'
import {
  createSoftphoneDisconnectDiagnostic,
  createSoftphoneOperationErrorDiagnostic,
  type SoftphoneCallDiagnosticContext,
} from '@/features/softphone/softphone-call-diagnostics'

const context: SoftphoneCallDiagnosticContext = {
  callIdentifier: 'call-123',
  callerId: '+4511111108',
  destination: '+4522222233',
  profileId: 'primary_ivr',
  profileName: 'Primary IVR',
  sessionId: 'session-123',
  userAgent: 'Test Browser',
}

describe('softphone call diagnostics', () => {
  test('formats ACS disconnect reason and copyable context', () => {
    const diagnostic = createSoftphoneDisconnectDiagnostic({
      context,
      endReason: {
        code: 408,
        message: 'Call timed out.',
        resultCategories: ['UnexpectedClientError'],
        subCode: 4506,
        transportCode: 'timeout',
      },
      occurredAt: '2026-08-20T12:00:00.000Z',
      state: 'Disconnected',
    })
    const details = JSON.parse(diagnostic.details) as unknown

    expect(diagnostic.message).toBe('ACS disconnected the call (code 408, subcode 4506): Call timed out.')
    expect(details).toEqual({
      call: {
        callerId: '+4511111108',
        destination: '+4522222233',
        identifier: 'call-123',
        state: 'Disconnected',
      },
      endReason: {
        code: 408,
        message: 'Call timed out.',
        resultCategories: ['UnexpectedClientError'],
        subCode: 4506,
        transportCode: 'timeout',
      },
      occurredAt: '2026-08-20T12:00:00.000Z',
      operation: 'stateChanged',
      profile: {
        id: 'primary_ivr',
        name: 'Primary IVR',
      },
      sessionId: 'session-123',
      userAgent: 'Test Browser',
    })
  })

  test('keeps useful details when ACS supplies no end reason', () => {
    const diagnostic = createSoftphoneDisconnectDiagnostic({
      context,
      occurredAt: '2026-08-20T12:00:00.000Z',
      state: 'Disconnected',
    })

    expect(diagnostic.message).toBe('ACS disconnected the call (code unknown, subcode unknown).')
    expect(JSON.parse(diagnostic.details).endReason).toBeNull()
  })

  test('serializes startup exceptions without including credentials', () => {
    const diagnostic = createSoftphoneOperationErrorDiagnostic({
      context,
      error: new Error('Token request failed.'),
      occurredAt: '2026-08-20T12:00:00.000Z',
      operation: 'start the call',
    })

    expect(diagnostic.message).toBe('Token request failed.')
    expect(diagnostic.details).toContain('Token request failed.')
    expect(diagnostic.details).not.toContain('accessKey')
    expect(diagnostic.details).not.toContain('token')
  })
})
