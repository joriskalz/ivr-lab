import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  __setSoftphoneIdentityClientFactoryForTests,
  issueSoftphoneAcsToken,
  resetSoftphoneAcsSessionsForTests,
} from '@/features/softphone/server/acs-session'
import { createDefaultSoftphoneScenario } from '@/features/softphone/scenario'
import { __resetSoftphoneServerConfigForTests } from '@/features/softphone/server/config'
import { createSoftphoneSession } from '@/features/softphone/server/session-store'

const originalEnv = {
  ...process.env,
}

describe('softphone ACS session issuance', () => {
  beforeEach(() => {
    process.env.SOFTPHONE_EXTERNAL_WRITE_SECRET = 'shared-secret'
    __resetSoftphoneServerConfigForTests()
    resetSoftphoneAcsSessionsForTests()
  })

  afterEach(() => {
    __setSoftphoneIdentityClientFactoryForTests(null)
    resetSoftphoneAcsSessionsForTests()
    __resetSoftphoneServerConfigForTests()
    process.env = { ...originalEnv }
  })

  test('creates a new ACS identity for an existing unlocked session', async () => {
    let createUserCalls = 0
    let getTokenCalls = 0

    __setSoftphoneIdentityClientFactoryForTests(() => ({
      async createUser() {
        createUserCalls += 1
        return {
          communicationUserId: 'user-1',
        }
      },
      async getToken() {
        getTokenCalls += 1
        return {
          token: 'token-1',
          expiresOnTimestamp: Date.now() + 60 * 60 * 1000,
        }
      },
    }))

    const scenario = createDefaultSoftphoneScenario()
    const { session } = createSoftphoneSession(scenario)
    const result = await issueSoftphoneAcsToken(session, scenario.config.profiles[0]!)

    expect(result.payload.token).toBe('token-1')
    expect(createUserCalls).toBe(1)
    expect(getTokenCalls).toBe(1)
  })

  test('reuses the existing session while the token is still fresh', async () => {
    let createUserCalls = 0
    let getTokenCalls = 0

    __setSoftphoneIdentityClientFactoryForTests(() => ({
      async createUser() {
        createUserCalls += 1
        return {
          communicationUserId: 'user-1',
        }
      },
      async getToken() {
        getTokenCalls += 1
        return {
          token: 'token-stable',
          expiresOnTimestamp: Date.now() + 60 * 60 * 1000,
        }
      },
    }))

    const scenario = createDefaultSoftphoneScenario()
    const { session } = createSoftphoneSession(scenario)
    const firstResult = await issueSoftphoneAcsToken(session, scenario.config.profiles[0]!)
    const secondResult = await issueSoftphoneAcsToken(session, scenario.config.profiles[0]!)

    expect(firstResult.payload.token).toBe('token-stable')
    expect(secondResult.payload.token).toBe('token-stable')
    expect(createUserCalls).toBe(1)
    expect(getTokenCalls).toBe(1)
  })

  test('refreshes the token when the cached one is expiring', async () => {
    let getTokenCalls = 0

    __setSoftphoneIdentityClientFactoryForTests(() => ({
      async createUser() {
        return {
          communicationUserId: 'user-1',
        }
      },
      async getToken() {
        getTokenCalls += 1
        return {
          token: `token-${getTokenCalls}`,
          expiresOnTimestamp: getTokenCalls === 1 ? Date.now() + 1_000 : Date.now() + 60 * 60 * 1000,
        }
      },
    }))

    const scenario = createDefaultSoftphoneScenario()
    const { session } = createSoftphoneSession(scenario)
    const firstResult = await issueSoftphoneAcsToken(session, scenario.config.profiles[0]!)
    const secondResult = await issueSoftphoneAcsToken(session, scenario.config.profiles[0]!)

    expect(firstResult.payload.token).toBe('token-1')
    expect(secondResult.payload.token).toBe('token-2')
    expect(getTokenCalls).toBe(2)
  })
})
