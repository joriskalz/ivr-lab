import { CommunicationIdentityClient } from '@azure/communication-identity'
import type { SoftphoneAcsTokenPayload, SoftphoneScenarioProfileConfig } from '@/features/softphone/types'
const SOFTPHONE_ACS_REFRESH_WINDOW_MS = 5 * 60 * 1000
import {
  getSoftphoneAcsSessionForSession,
  resetSoftphoneSessionsForTests,
  setSoftphoneAcsSessionForSession,
  type SoftphoneSessionRecord,
} from '@/features/softphone/server/session-store'

type SoftphoneIdentityClientLike = {
  createUser: () => Promise<{ communicationUserId: string }>
  getToken: (
    identity: { communicationUserId: string },
    scopes: string[],
  ) => Promise<{ expiresOnTimestamp?: number; token: string }>
}

let identityClientFactory: (() => SoftphoneIdentityClientLike) | null = null

function buildConnectionString(profile: SoftphoneScenarioProfileConfig) {
  return `endpoint=${profile.acsEndpoint.replace(/\/+$/, '')};accessKey=${profile.acsAccessKey}`
}

function resolveIdentityClient(profile: SoftphoneScenarioProfileConfig) {
  if (identityClientFactory != null) {
    return identityClientFactory()
  }

  return new CommunicationIdentityClient(buildConnectionString(profile))
}

function resolveExpiresAt(rawValue: unknown) {
  return typeof rawValue === 'number' && Number.isFinite(rawValue)
    ? rawValue
    : Date.now() + 55 * 60 * 1000
}

async function issueTokenForUser(profile: SoftphoneScenarioProfileConfig, communicationUserId?: string) {
  const identityClient = resolveIdentityClient(profile)
  const resolvedUserId =
    communicationUserId ??
    (await identityClient.createUser()).communicationUserId
  const token = await identityClient.getToken({ communicationUserId: resolvedUserId }, ['voip'])

  return {
    communicationUserId: resolvedUserId,
    expiresAt: resolveExpiresAt('expiresOnTimestamp' in token ? token.expiresOnTimestamp : undefined),
    token: token.token,
  }
}

export async function issueSoftphoneAcsToken(
  session: SoftphoneSessionRecord,
  profile: SoftphoneScenarioProfileConfig,
): Promise<{
  payload: SoftphoneAcsTokenPayload
}> {
  const existingSession = getSoftphoneAcsSessionForSession(session)
  const shouldRefresh =
    existingSession == null ||
    existingSession.profileId !== profile.id ||
    existingSession.expiresAt - Date.now() <= SOFTPHONE_ACS_REFRESH_WINDOW_MS

  const nextSession = shouldRefresh
    ? await issueTokenForUser(profile, existingSession?.profileId === profile.id ? existingSession.communicationUserId : undefined)
    : existingSession

  setSoftphoneAcsSessionForSession(session, {
    ...nextSession,
    profileId: profile.id,
  })

  return {
    payload: {
      expiresAt: new Date(nextSession.expiresAt).toISOString(),
      token: nextSession.token,
    },
  }
}

export function __setSoftphoneIdentityClientFactoryForTests(factory: (() => SoftphoneIdentityClientLike) | null) {
  identityClientFactory = factory
}

export function resetSoftphoneAcsSessionsForTests() {
  resetSoftphoneSessionsForTests()
}
