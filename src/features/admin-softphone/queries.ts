import '@tanstack/react-start/server-only'
import { desc, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/db'
import { adminSoftphoneCalls, adminSoftphoneFeedback, softphoneScenarioManagers, softphoneTestScenarios, user } from '@/db/schema'
import { isAppUserRole, normalizeAppUserRole, type AppUserRole } from '@/features/auth/roles'
import type { AdminOperatorSnapshot, AdminScenarioManagerUser, AdminSoftphoneHistoryEntry } from '@/features/admin-softphone/types'
import { normalizeSoftphoneCallHistoryEntry, type SoftphoneCallHistoryEntry } from '@/features/softphone/call-history'
import { normalizeSoftphoneScenarioConfig } from '@/features/softphone/scenario'
import type { SoftphoneScenarioConfig, SoftphoneTestScenarioRecord } from '@/features/softphone/types'
import { secureRandomDigits, secureRandomUppercaseLetters } from '@/lib/secure-random'

const SOFTPHONE_SCENARIO_ID_PATTERN = /^[A-Z]{6}$/
const SOFTPHONE_SCENARIO_ACCESS_KEY_PATTERN = /^\d{5}$/

function resolveScenarioTimestamp(value: Date | string | number | null | undefined) {
  const timestamp = value instanceof Date ? value : new Date(value ?? Date.now())

  return Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString()
}

function resolveRandomScenarioAccessKey() {
  return secureRandomDigits(5)
}

export function listSoftphoneScenarioManagerRows() {
  return getDb()
    .select()
    .from(softphoneScenarioManagers)
    .all()
}

export function listSoftphoneScenarioIdsForUser(userId: string) {
  return listSoftphoneScenarioManagerRows()
    .filter((assignment) => assignment.userId === userId)
    .map((assignment) => assignment.scenarioId)
}

export function listAdminSoftphoneHistory(accessibleScenarioIds?: string[]): AdminSoftphoneHistoryEntry[] {
  const rows = getDb()
    .select({
      callPayload: adminSoftphoneCalls.callPayload,
      feedbackPayload: adminSoftphoneFeedback.feedbackPayload,
      operatorEmail: adminSoftphoneCalls.operatorEmail,
      operatorImage: adminSoftphoneCalls.operatorImage,
      operatorName: adminSoftphoneCalls.operatorName,
      operatorRole: adminSoftphoneCalls.operatorRole,
      operatorUserId: adminSoftphoneCalls.operatorUserId,
    })
    .from(adminSoftphoneCalls)
    .leftJoin(adminSoftphoneFeedback, eq(adminSoftphoneFeedback.callId, adminSoftphoneCalls.id))
    .orderBy(desc(adminSoftphoneCalls.endedAt))
    .all()

  const normalizedRows = rows.map((row) => {
    const normalizedCall = normalizeSoftphoneCallHistoryEntry({
      ...(row.callPayload as SoftphoneCallHistoryEntry),
      feedback: row.feedbackPayload ?? (row.callPayload as SoftphoneCallHistoryEntry).feedback ?? null,
    })
    const operator: AdminOperatorSnapshot | null = row.operatorUserId || row.operatorEmail || row.operatorName
      ? {
          email: row.operatorEmail ?? null,
          id: row.operatorUserId ?? null,
          image: row.operatorImage ?? null,
          name: row.operatorName ?? null,
          role: row.operatorRole == null ? null : normalizeAppUserRole(row.operatorRole),
        }
      : null

    return {
      ...normalizedCall,
      operator,
    }
  })

  if (accessibleScenarioIds == null) {
    return normalizedRows
  }

  const allowedScenarioIds = new Set(accessibleScenarioIds)
  return normalizedRows.filter((entry) => entry.scenarioId != null && allowedScenarioIds.has(entry.scenarioId))
}

export function upsertAdminSoftphoneCall(input: {
  call: SoftphoneCallHistoryEntry
  operator: AdminOperatorSnapshot | null
}) {
  const callValues = {
    callIdentifier: input.call.callIdentifier,
    callPayload: input.call,
    clientEntryId: input.call.id,
    correlationCode: input.call.correlationCode,
    endedAt: input.call.endedAt,
    finalCallState: input.call.finalCallState,
    operatorEmail: input.operator?.email ?? null,
    operatorImage: input.operator?.image ?? null,
    operatorName: input.operator?.name ?? null,
    operatorRole: input.operator?.role ?? null,
    operatorUserId: input.operator?.id ?? null,
    profileId: input.call.profileId,
    profileName: input.call.profileName,
    profileSnapshot: input.call.profileSnapshot ?? null,
    sessionId: input.call.sessionId,
    startedAt: input.call.startedAt,
    totalDurationMs: input.call.totalDurationMs,
    totalDurationWithoutInitMs: input.call.totalDurationWithoutInitMs,
    updatedAt: new Date(),
  }

  getDb()
    .insert(adminSoftphoneCalls)
    .values(callValues)
    .onConflictDoUpdate({
      set: callValues,
      target: adminSoftphoneCalls.clientEntryId,
    })
    .run()

  const persistedCall = getDb()
    .select({ id: adminSoftphoneCalls.id })
    .from(adminSoftphoneCalls)
    .where(eq(adminSoftphoneCalls.clientEntryId, input.call.id))
    .get()

  if (persistedCall == null || input.call.feedback == null) {
    return
  }

  const feedbackValues = {
    callId: persistedCall.id,
    feedbackPayload: input.call.feedback,
    phaseGroup: input.call.feedback.phaseGroup,
    sentiment: input.call.feedback.sentiment,
    severityRating: input.call.feedback.severityRating,
    submittedAt: input.call.feedback.submittedAt,
    updatedAt: new Date(),
  }

  getDb()
    .insert(adminSoftphoneFeedback)
    .values(feedbackValues)
    .onConflictDoUpdate({
      set: feedbackValues,
      target: adminSoftphoneFeedback.callId,
    })
    .run()
}

export function deleteAdminSoftphoneHistoryForScenario(scenarioId: string) {
  const normalizedScenarioId = scenarioId.trim().toUpperCase()

  if (!isValidSoftphoneScenarioId(normalizedScenarioId)) {
    throw new Error('Scenario identifier is invalid.')
  }

  const rows = getDb()
    .select({
      callPayload: adminSoftphoneCalls.callPayload,
      id: adminSoftphoneCalls.id,
    })
    .from(adminSoftphoneCalls)
    .all()

  const matchingCallIds = rows
    .filter((row) => {
      const payload = row.callPayload as SoftphoneCallHistoryEntry
      const payloadScenarioId = payload.scenarioId ?? payload.scenarioSnapshot?.id ?? null

      return payloadScenarioId != null && payloadScenarioId.trim().toUpperCase() === normalizedScenarioId
    })
    .map((row) => row.id)

  if (matchingCallIds.length === 0) {
    return 0
  }

  getDb()
    .delete(adminSoftphoneFeedback)
    .where(inArray(adminSoftphoneFeedback.callId, matchingCallIds))
    .run()

  getDb()
    .delete(adminSoftphoneCalls)
    .where(inArray(adminSoftphoneCalls.id, matchingCallIds))
    .run()

  return matchingCallIds.length
}

function resolveRandomScenarioId() {
  return secureRandomUppercaseLetters(6)
}

export function isValidSoftphoneScenarioId(value: string) {
  return SOFTPHONE_SCENARIO_ID_PATTERN.test(value.trim())
}

export function createUniqueSoftphoneScenarioId() {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const nextId = resolveRandomScenarioId()
    const existingScenario = getDb()
      .select({ id: softphoneTestScenarios.id })
      .from(softphoneTestScenarios)
      .where(eq(softphoneTestScenarios.id, nextId))
      .get()

    if (existingScenario == null) {
      return nextId
    }
  }

  throw new Error('Unable to allocate a unique softphone scenario identifier.')
}

export function listSoftphoneTestScenarios(accessibleScenarioIds?: string[]): SoftphoneTestScenarioRecord[] {
  const rows = getDb()
    .select()
    .from(softphoneTestScenarios)
    .orderBy(softphoneTestScenarios.name)
    .all()

  const scenarios = rows.map((row) => ({
    accessKey: row.accessKey,
    config: normalizeSoftphoneScenarioConfig(row.config),
    createdAt: resolveScenarioTimestamp(row.createdAt),
    id: row.id,
    name: row.name,
    updatedAt: resolveScenarioTimestamp(row.updatedAt),
  }))

  if (accessibleScenarioIds == null) {
    return scenarios
  }

  const allowedScenarioIds = new Set(accessibleScenarioIds)
  return scenarios.filter((scenario) => allowedScenarioIds.has(scenario.id))
}

export function getSoftphoneTestScenarioById(id: string): SoftphoneTestScenarioRecord | null {
  const normalizedId = id.trim().toUpperCase()

  if (!isValidSoftphoneScenarioId(normalizedId)) {
    return null
  }

  const row = getDb()
    .select()
    .from(softphoneTestScenarios)
    .where(eq(softphoneTestScenarios.id, normalizedId))
    .get()

  if (row == null) {
    return null
  }

  return {
    accessKey: row.accessKey,
    config: normalizeSoftphoneScenarioConfig(row.config),
    createdAt: resolveScenarioTimestamp(row.createdAt),
    id: row.id,
    name: row.name,
    updatedAt: resolveScenarioTimestamp(row.updatedAt),
  }
}

export function listAdminScenarioManagerUsers(): AdminScenarioManagerUser[] {
  const users = getDb()
    .select({
      email: user.email,
      id: user.id,
      image: user.image,
      name: user.name,
      role: user.role,
    })
    .from(user)
    .orderBy(user.name, user.email)
    .all()
  const scenarioIdsByUserId = new Map<string, string[]>()

  for (const assignment of listSoftphoneScenarioManagerRows()) {
    const existingScenarioIds = scenarioIdsByUserId.get(assignment.userId) ?? []
    existingScenarioIds.push(assignment.scenarioId)
    scenarioIdsByUserId.set(assignment.userId, existingScenarioIds)
  }

  return users.map((candidate) => ({
    email: candidate.email,
    id: candidate.id,
    image: candidate.image ?? null,
    managedScenarioIds: scenarioIdsByUserId.get(candidate.id) ?? [],
    name: candidate.name,
    role: isAppUserRole(candidate.role) ? candidate.role : null,
  }))
}

export function updateUserRole(input: {
  role: AppUserRole
  userId: string
}) {
  getDb()
    .update(user)
    .set({ role: input.role })
    .where(eq(user.id, input.userId))
    .run()
}

export function replaceSoftphoneScenarioManagers(input: {
  scenarioId: string
  userIds: string[]
}) {
  const normalizedScenarioId = input.scenarioId.trim().toUpperCase()

  if (!isValidSoftphoneScenarioId(normalizedScenarioId)) {
    throw new Error('Scenario identifier must be a 6-letter string.')
  }

  const uniqueUserIds = Array.from(new Set(input.userIds.map((userId) => userId.trim()).filter(Boolean)))

  getDb()
    .delete(softphoneScenarioManagers)
    .where(eq(softphoneScenarioManagers.scenarioId, normalizedScenarioId))
    .run()

  if (uniqueUserIds.length === 0) {
    return
  }

  getDb()
    .insert(softphoneScenarioManagers)
    .values(uniqueUserIds.map((userId) => ({
      scenarioId: normalizedScenarioId,
      userId,
    })))
    .run()
}

export function saveSoftphoneTestScenario(input: {
  accessKey?: string | null
  config: SoftphoneScenarioConfig
  id?: string | null
  name: string
}): SoftphoneTestScenarioRecord {
  const normalizedName = input.name.trim()

  if (!normalizedName) {
    throw new Error('Scenario name is required.')
  }

  const normalizedConfig = normalizeSoftphoneScenarioConfig(input.config)
  const normalizedId = input.id?.trim().toUpperCase()
  const scenarioId = normalizedId && isValidSoftphoneScenarioId(normalizedId)
    ? normalizedId
    : createUniqueSoftphoneScenarioId()
  const existingScenario = normalizedId != null ? getSoftphoneTestScenarioById(normalizedId) : null
  const normalizedAccessKey = input.accessKey?.trim() ?? ''
  const scenarioAccessKey = SOFTPHONE_SCENARIO_ACCESS_KEY_PATTERN.test(normalizedAccessKey)
    ? normalizedAccessKey
    : existingScenario?.accessKey ?? resolveRandomScenarioAccessKey()
  const now = new Date()

  getDb()
    .insert(softphoneTestScenarios)
    .values({
      accessKey: scenarioAccessKey,
      config: normalizedConfig,
      id: scenarioId,
      name: normalizedName,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        accessKey: scenarioAccessKey,
        config: normalizedConfig,
        name: normalizedName,
        updatedAt: now,
      },
      target: softphoneTestScenarios.id,
    })
    .run()

  const savedScenario = getSoftphoneTestScenarioById(scenarioId)

  if (savedScenario == null) {
    throw new Error('Unable to save softphone scenario.')
  }

  return savedScenario
}

export function deleteSoftphoneTestScenario(input: {
  scenarioId: string
}) {
  const normalizedScenarioId = input.scenarioId.trim().toUpperCase()

  if (!isValidSoftphoneScenarioId(normalizedScenarioId)) {
    throw new Error('Scenario identifier must be a 6-letter string.')
  }

  const deletedScenario = getSoftphoneTestScenarioById(normalizedScenarioId)

  if (deletedScenario == null) {
    throw new Error('Scenario not found.')
  }

  getDb()
    .delete(softphoneScenarioManagers)
    .where(eq(softphoneScenarioManagers.scenarioId, normalizedScenarioId))
    .run()

  getDb()
    .delete(softphoneTestScenarios)
    .where(eq(softphoneTestScenarios.id, normalizedScenarioId))
    .run()

  return deletedScenario
}
