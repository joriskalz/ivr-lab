import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { normalizeSoftphoneScenarioConfig } from '@/features/softphone/scenario'
import { getEnabledAuthProviders } from '@/features/auth/auth'
import {
  canCreateScenarios,
  canEditAssignedScenarios,
  canManageUsers,
  canViewAssignedAnalytics,
  canViewAssignedScenarios,
  isAppUserRole,
  normalizeAppUserRole,
} from '@/features/auth/roles'
import { getAdminSession, getAuthSession } from '@/features/auth/session'
import {
  deleteSoftphoneTestScenario,
  deleteAdminSoftphoneHistoryForScenario,
  listAdminSoftphoneHistory,
  listAdminScenarioManagerUsers,
  listSoftphoneScenarioIdsForUser,
  listSoftphoneTestScenarios,
  replaceSoftphoneScenarioManagers,
  saveSoftphoneTestScenario,
  updateUserRole,
  upsertAdminSoftphoneCall,
} from '@/features/admin-softphone/queries'
import type {
  AdminSoftphoneDashboardData,
  DeleteSoftphoneTestScenarioInput,
  DeleteAdminSoftphoneScenarioHistoryInput,
  PersistSoftphoneScenarioManagersInput,
  AdminViewerSnapshot,
  PersistAdminSoftphoneCallInput,
  PersistSoftphoneTestScenarioInput,
} from '@/features/admin-softphone/types'
import { normalizeSoftphoneCallHistoryEntry } from '@/features/softphone/call-history'
import { resolveSoftphoneSessionFromRequestHeaders } from '@/features/softphone/server/session-store'

function validatePersistInput(input: PersistAdminSoftphoneCallInput) {
  return {
    call: normalizeSoftphoneCallHistoryEntry(input.call),
  } satisfies PersistAdminSoftphoneCallInput
}

function validateScenarioInput(input: PersistSoftphoneTestScenarioInput) {
  return {
    accessKey: input.accessKey?.trim() || null,
    config: normalizeSoftphoneScenarioConfig(input.config),
    id: input.id?.trim() || null,
    name: input.name.trim(),
  } satisfies PersistSoftphoneTestScenarioInput
}

function validateScenarioManagersInput(input: PersistSoftphoneScenarioManagersInput) {
  return {
    scenarioId: input.scenarioId.trim().toUpperCase(),
    userIds: input.userIds.map((userId) => userId.trim()).filter((userId) => userId.length > 0),
  } satisfies PersistSoftphoneScenarioManagersInput
}

function validateDeleteScenarioInput(input: DeleteSoftphoneTestScenarioInput) {
  return {
    scenarioId: input.scenarioId.trim().toUpperCase(),
  } satisfies DeleteSoftphoneTestScenarioInput
}

function validateDeleteScenarioHistoryInput(input: DeleteAdminSoftphoneScenarioHistoryInput) {
  return {
    scenarioId: input.scenarioId.trim().toUpperCase(),
  } satisfies DeleteAdminSoftphoneScenarioHistoryInput
}

function validateUserRoleInput(input: {
  role: string
  userId: string
}) {
  const normalizedRole = input.role.trim().toLowerCase()

  if (!isAppUserRole(normalizedRole)) {
    throw new Error('Role must be one of admin, manager, reader, or user.')
  }

  return {
    role: normalizedRole,
    userId: input.userId.trim(),
  } satisfies {
    role: 'admin' | 'manager' | 'reader' | 'user'
    userId: string
  }
}

function toViewer(session: NonNullable<Awaited<ReturnType<typeof getAdminSession>>>): AdminViewerSnapshot {
  return {
    email: session.user.email,
    id: session.user.id,
    image: session.user.image ?? null,
    name: session.user.name,
    role: normalizeAppUserRole(session.user.role),
  }
}

export const mirrorSoftphoneCallToAdminStorage = createServerFn({ method: 'POST' })
  .inputValidator(validatePersistInput)
  .handler(async ({ data }) => {
    const headers = getRequestHeaders()
    const softphoneSession = resolveSoftphoneSessionFromRequestHeaders(headers)

    // Writes into admin call storage are only accepted from a live softphone
    // session, and the reported call must belong to that session's unlock.
    if (softphoneSession == null || data.call.sessionId !== softphoneSession.sessionId) {
      throw new Error('A valid softphone session is required to record call history.')
    }

    if (data.call.scenarioId != null && data.call.scenarioId !== softphoneSession.scenario.id) {
      throw new Error('Call history must match the unlocked softphone scenario.')
    }

    const session = await getAuthSession(headers)

    upsertAdminSoftphoneCall({
      call: data.call,
      operator: session == null
        ? null
        : {
            email: session.user.email,
            id: session.user.id,
            image: session.user.image ?? null,
            name: session.user.name,
            role: session.user.role ?? 'user',
          },
    })

    return {
      ok: true,
    }
  })

export const getAdminSoftphoneDashboard = createServerFn({ method: 'GET' }).handler(async (): Promise<AdminSoftphoneDashboardData> => {
  const providers = getEnabledAuthProviders()
  const session = await getAdminSession(getRequestHeaders())

  if (session == null) {
    return {
      providers,
      status: 'unauthenticated',
    }
  }

  const role = normalizeAppUserRole(session.user.role)
  const isAdmin = role === 'admin'
  let accessibleScenarioIds: string[] | undefined

  if (!isAdmin) {
    const assignedScenarioIds = listSoftphoneScenarioIdsForUser(session.user.id)

    if (assignedScenarioIds.length === 0) {
      return {
        providers,
        status: 'forbidden',
        viewer: toViewer(session),
      }
    }

    accessibleScenarioIds = assignedScenarioIds
  }

  return {
    history: listAdminSoftphoneHistory(accessibleScenarioIds),
    permissions: {
      canCreateScenarios: canCreateScenarios(role),
      canEditScenarios: canEditAssignedScenarios(role),
      canManageUsers: canManageUsers(role),
      canViewAnalytics: canViewAssignedAnalytics(role),
      canViewScenarios: canViewAssignedScenarios(role),
    },
    providers,
    scenarios: listSoftphoneTestScenarios(accessibleScenarioIds),
    status: 'authorized',
    users: isAdmin ? listAdminScenarioManagerUsers() : [],
    viewer: toViewer(session),
  }
})

export const saveAdminSoftphoneScenario = createServerFn({ method: 'POST' })
  .inputValidator(validateScenarioInput)
  .handler(async ({ data }) => {
    const session = await getAdminSession(getRequestHeaders())

    if (session == null) {
      throw new Error('Sign in required.')
    }

    const role = normalizeAppUserRole(session.user.role)
    const isAdmin = role === 'admin'
    const accessibleScenarioIds = isAdmin ? [] : listSoftphoneScenarioIdsForUser(session.user.id)

    if (data.id == null && !isAdmin) {
      throw new Error('Only admins can create new scenarios.')
    }

    if (data.id != null && !canEditAssignedScenarios(role)) {
      throw new Error('You do not have permission to edit scenarios.')
    }

    if (data.id != null && !isAdmin && !accessibleScenarioIds.includes(data.id)) {
      throw new Error('You do not have access to manage this scenario.')
    }

    return saveSoftphoneTestScenario(data)
  })

export const replaceAdminSoftphoneScenarioManagers = createServerFn({ method: 'POST' })
  .inputValidator(validateScenarioManagersInput)
  .handler(async ({ data }) => {
    const session = await getAdminSession(getRequestHeaders())

    if (session == null || session.user.role !== 'admin') {
      throw new Error('Admin access required.')
    }

    replaceSoftphoneScenarioManagers(data)

    return {
      ok: true,
    }
  })

export const deleteAdminSoftphoneScenario = createServerFn({ method: 'POST' })
  .inputValidator(validateDeleteScenarioInput)
  .handler(async ({ data }) => {
    const session = await getAdminSession(getRequestHeaders())

    if (session == null || normalizeAppUserRole(session.user.role) !== 'admin') {
      throw new Error('Admin access required.')
    }

    const deletedScenario = deleteSoftphoneTestScenario(data)

    return {
      scenarioId: deletedScenario.id,
    }
  })

export const deleteAdminSoftphoneScenarioHistory = createServerFn({ method: 'POST' })
  .inputValidator(validateDeleteScenarioHistoryInput)
  .handler(async ({ data }) => {
    const session = await getAdminSession(getRequestHeaders())

    if (session == null || normalizeAppUserRole(session.user.role) !== 'admin') {
      throw new Error('Admin access required.')
    }

    const deletedCalls = deleteAdminSoftphoneHistoryForScenario(data.scenarioId)

    return {
      deletedCalls,
      scenarioId: data.scenarioId,
    }
  })

export const updateAdminSoftphoneUserRole = createServerFn({ method: 'POST' })
  .inputValidator(validateUserRoleInput)
  .handler(async ({ data }) => {
    const session = await getAdminSession(getRequestHeaders())

    if (session == null || normalizeAppUserRole(session.user.role) !== 'admin') {
      throw new Error('Admin access required.')
    }

    updateUserRole(data)

    return {
      ok: true,
    }
  })
