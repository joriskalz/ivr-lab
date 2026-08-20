import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { listSoftphoneScenarioIdsForUser } from '@/features/admin-softphone/queries'
import { normalizeAppUserRole } from '@/features/auth/roles'
import { getAdminSession } from '@/features/auth/session'

export type AdminRouteAccessState = 'authorized' | 'forbidden' | 'unauthenticated'

export const getViewerRouteAccess = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getAdminSession(getRequestHeaders())

  if (session == null) {
    return {
      hasAdminAccess: false,
      isAuthenticated: false,
    } as const
  }

  if (normalizeAppUserRole(session.user.role) === 'admin') {
    return {
      hasAdminAccess: true,
      isAuthenticated: true,
    } as const
  }

  return {
    hasAdminAccess: listSoftphoneScenarioIdsForUser(session.user.id).length > 0,
    isAuthenticated: true,
  } as const
})

export const getAdminRouteAccess = createServerFn({ method: 'GET' }).handler(async () => {
  const access = await getViewerRouteAccess()

  if (!access.isAuthenticated) {
    return {
      status: 'unauthenticated',
    } as const satisfies { status: AdminRouteAccessState }
  }

  return {
    status: access.hasAdminAccess ? 'authorized' : 'forbidden',
  } as const satisfies { status: AdminRouteAccessState }
})
