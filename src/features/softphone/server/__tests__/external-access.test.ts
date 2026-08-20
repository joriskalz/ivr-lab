import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  SOFTPHONE_SHARED_SECRET_PLACEHOLDER,
  resolveSoftphoneExternalEndpointCopyPayload,
  resolveSoftphoneExternalEndpointSampleYaml,
} from '@/features/softphone/external-endpoints'
import { createDefaultSoftphoneScenario } from '@/features/softphone/scenario'
import { __resetSoftphoneServerConfigForTests } from '@/features/softphone/server/config'
import {
  SOFTPHONE_CORRELATION_HEADER,
  resolveSoftphoneExternalEndpointBundle,
  resolveSoftphoneExternalTargetSession,
  validateSoftphoneExternalWriteAccess,
} from '@/features/softphone/server/external-access'
import { resetSoftphoneRateLimitsForTests } from '@/features/softphone/server/rate-limit'
import { createSoftphoneSession, resetSoftphoneSessionsForTests } from '@/features/softphone/server/session-store'

const originalEnv = {
  ...process.env,
}

describe('softphone external access', () => {
  beforeEach(() => {
    process.env.SOFTPHONE_EXTERNAL_WRITE_SECRET = 'shared-secret'
    resetSoftphoneSessionsForTests()
    resetSoftphoneRateLimitsForTests()
    __resetSoftphoneServerConfigForTests()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    resetSoftphoneSessionsForTests()
    resetSoftphoneRateLimitsForTests()
    __resetSoftphoneServerConfigForTests()
  })

  test('creates the shared endpoint bundle for one session correlation code', () => {
    const { session } = createSoftphoneSession(createDefaultSoftphoneScenario())
    const bundle = resolveSoftphoneExternalEndpointBundle(session.correlationCode, { revealSecret: true })

    expect(bundle.caseGetUrl).toBe('/api/public/softphone/case/get')
    expect(bundle.caseSetUrl).toBe('/api/public/softphone/case/set')
    expect(bundle.correlationHeaderName).toBe(SOFTPHONE_CORRELATION_HEADER)
    expect(bundle.correlationHeaderValue).toBe(session.correlationCode)
    expect(bundle.headerName).toBe('x-softphone-shared-secret')
    expect(bundle.headerValue).toBe('shared-secret')
    expect(bundle.eventSetUrl).toBe('/api/public/softphone/case/event/set')
    expect(bundle.phaseSetUrl).toBe('/api/public/softphone/case/phase/set')
  })

  test('hides the shared secret from the endpoint bundle by default', () => {
    const { session } = createSoftphoneSession(createDefaultSoftphoneScenario())
    const bundle = resolveSoftphoneExternalEndpointBundle(session.correlationCode)

    expect(bundle.headerValue).toBe(SOFTPHONE_SHARED_SECRET_PLACEHOLDER)
  })

  test('accepts only the configured external secret header', () => {
    expect(
      validateSoftphoneExternalWriteAccess(
        new Request('http://localhost/api/public/softphone/case/set', {
          headers: {
            'x-softphone-shared-secret': 'shared-secret',
          },
        }),
      ),
    ).toBe(true)

    expect(
      validateSoftphoneExternalWriteAccess(
        new Request('http://localhost/api/public/softphone/case/set', {
          headers: {
            'x-softphone-shared-secret': 'wrong-secret',
          },
        }),
      ),
    ).toBe(false)
  })

  test('resolves the target browser session from the shared secret and correlation code', () => {
    const { session } = createSoftphoneSession(createDefaultSoftphoneScenario())
    const result = resolveSoftphoneExternalTargetSession(
      new Request('http://localhost/api/public/softphone/case/set', {
        headers: {
          'x-softphone-shared-secret': 'shared-secret',
          [SOFTPHONE_CORRELATION_HEADER]: session.correlationCode,
        },
      }),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.session.correlationCode).toBe(session.correlationCode)
    }
  })

  test('rejects missing or unknown correlation codes', () => {
    const missingCorrelation = resolveSoftphoneExternalTargetSession(
      new Request('http://localhost/api/public/softphone/case/set', {
        headers: {
          'x-softphone-shared-secret': 'shared-secret',
        },
      }),
    )
    const unknownCorrelation = resolveSoftphoneExternalTargetSession(
      new Request('http://localhost/api/public/softphone/case/set', {
        headers: {
          'x-softphone-shared-secret': 'shared-secret',
          [SOFTPHONE_CORRELATION_HEADER]: '9999',
        },
      }),
    )

    expect(missingCorrelation).toEqual({
      error: 'A valid 4-digit softphone correlation code is required.',
      ok: false,
      status: 400,
    })
    expect(unknownCorrelation).toEqual({
      error: 'Unknown softphone correlation code.',
      ok: false,
      status: 404,
    })
  })

  test('locks out repeated failing external requests', () => {
    const buildInvalidRequest = () =>
      new Request('http://localhost/api/public/softphone/case/set', {
        headers: {
          'x-forwarded-for': '203.0.113.7',
          'x-softphone-shared-secret': 'wrong-secret',
        },
      })

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = resolveSoftphoneExternalTargetSession(buildInvalidRequest())
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.status).toBe(403)
      }
    }

    const blockedResult = resolveSoftphoneExternalTargetSession(buildInvalidRequest())

    expect(blockedResult.ok).toBe(false)
    if (!blockedResult.ok) {
      expect(blockedResult.status).toBe(429)
    }
  })

  test('formats copy payload and sample yaml with both headers and case get support', () => {
    const bundle = resolveSoftphoneExternalEndpointBundle('4821', { revealSecret: true })
    const payload = resolveSoftphoneExternalEndpointCopyPayload(bundle, 'https://lab.contoso.test')
    const yaml = resolveSoftphoneExternalEndpointSampleYaml({
      correlationHeaderName: bundle.correlationHeaderName,
      correlationHeaderValue: bundle.correlationHeaderValue,
      headerName: bundle.headerName,
      headerValue: bundle.headerValue,
      kind: 'caseGet',
      url: 'https://lab.contoso.test/api/public/softphone/case/get',
    })

    expect(payload).toContain('"caseGet": "https://lab.contoso.test/api/public/softphone/case/get"')
    expect(payload).toContain('"eventSet": "https://lab.contoso.test/api/public/softphone/case/event/set"')
    expect(payload).toContain('"phaseSet": "https://lab.contoso.test/api/public/softphone/case/phase/set"')
    expect(payload).toContain('"x-softphone-correlation-code": "4821"')
    expect(payload).toContain('"x-softphone-shared-secret": "shared-secret"')
    expect(yaml).toContain('method: Get')
    expect(yaml).toContain('x-softphone-correlation-code: ="4821"')
    expect(yaml).toContain('x-softphone-shared-secret: ="shared-secret"')
  })
})
