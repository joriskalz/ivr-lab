import { beforeEach, describe, expect, test } from 'bun:test'
import { createDefaultSoftphoneScenario } from '@/features/softphone/scenario'
import { SOFTPHONE_SESSION_HEADER } from '@/features/softphone/session'
import {
  createSoftphoneSession,
  getSoftphoneSession,
  getSoftphoneSessionById,
  pruneExpiredSoftphoneSessions,
  resetSoftphoneSessionsForTests,
  resolveSoftphoneSessionIdFromCookie,
} from '@/features/softphone/server/session-store'

const SOFTPHONE_SESSION_TTL_MS = 60 * 60 * 24 * 7 * 1000

function resolveCookieHeader(headers: Headers) {
  const setCookie = headers.get('set-cookie')

  if (setCookie == null) {
    throw new Error('Expected set-cookie header to be present.')
  }

  return setCookie
}

describe('softphone session store', () => {
  beforeEach(() => {
    resetSoftphoneSessionsForTests()
  })

  test('creates a stable browser session and correlation code for one cookie', () => {
    const first = createSoftphoneSession(createDefaultSoftphoneScenario())
    const cookie = resolveCookieHeader(first.headers)
    const second = getSoftphoneSession(new Request('http://localhost/api/softphone/bootstrap', { headers: { cookie } }))

    expect(first.session.correlationCode).toMatch(/^\d{4}$/)
    expect(second?.correlationCode).toBe(first.session.correlationCode)
    expect(resolveSoftphoneSessionIdFromCookie(new Request('http://localhost', { headers: { cookie } }))).toBe(first.session.sessionId)
  })

  test('returns null when no cookie-backed session exists', () => {
    expect(getSoftphoneSession(new Request('http://localhost/api/softphone/bootstrap'))).toBeNull()
  })

  test('resolves a session from the explicit session header', () => {
    const first = createSoftphoneSession(createDefaultSoftphoneScenario())
    const second = getSoftphoneSession(
      new Request('http://localhost/api/softphone/bootstrap', {
        headers: {
          [SOFTPHONE_SESSION_HEADER]: first.session.sessionId,
        },
      }),
    )

    expect(second?.sessionId).toBe(first.session.sessionId)
    expect(second?.correlationCode).toBe(first.session.correlationCode)
  })

  test('generates different correlation codes for concurrent sessions', () => {
    const first = createSoftphoneSession(createDefaultSoftphoneScenario())
    const second = createSoftphoneSession(createDefaultSoftphoneScenario())

    expect(first.session.correlationCode).not.toBe(second.session.correlationCode)
  })

  test('evicts sessions whose TTL has elapsed and frees their correlation code', () => {
    const { session } = createSoftphoneSession(createDefaultSoftphoneScenario())
    const expiredCode = session.correlationCode
    const futureNow = Date.now() + SOFTPHONE_SESSION_TTL_MS + 1

    expect(pruneExpiredSoftphoneSessions(futureNow)).toBe(1)
    expect(getSoftphoneSessionById(session.sessionId)).toBeNull()

    // The freed code is available again for a brand-new session.
    let reusedCode: string | null = null
    for (let attempt = 0; attempt < 50_000 && reusedCode == null; attempt += 1) {
      const next = createSoftphoneSession(createDefaultSoftphoneScenario())
      if (next.session.correlationCode === expiredCode) {
        reusedCode = next.session.correlationCode
      }
    }

    expect(reusedCode).toBe(expiredCode)
  })

  test('keeps sessions that are still within their TTL', () => {
    const { session } = createSoftphoneSession(createDefaultSoftphoneScenario())

    expect(pruneExpiredSoftphoneSessions(Date.now())).toBe(0)
    expect(getSoftphoneSessionById(session.sessionId)?.sessionId).toBe(session.sessionId)
  })

  test('does not evict a session that keeps being accessed', () => {
    const { session } = createSoftphoneSession(createDefaultSoftphoneScenario())

    // Accessing slides lastSeenAt forward, so a later prune should not remove it.
    expect(getSoftphoneSessionById(session.sessionId)?.sessionId).toBe(session.sessionId)
    expect(pruneExpiredSoftphoneSessions(Date.now() + SOFTPHONE_SESSION_TTL_MS - 1)).toBe(0)
  })
})
