import '@tanstack/react-start/server-only'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@/features/auth/auth'
import { type AppUserRole } from '@/features/auth/roles'
import { ensureAdminRoleIfEligible } from '@/features/auth/rbac'

export interface AuthSessionUser {
  email: string
  id: string
  image?: string | null
  name: string
  role?: AppUserRole | null
}

export interface AuthSessionState {
  session: {
    expiresAt: Date
    id: string
    userId: string
  }
  user: AuthSessionUser
}

export async function getAuthSession(headers = getRequestHeaders()) {
  const session = await auth.api.getSession({
    headers,
  })

  return session as AuthSessionState | null
}

export async function getAdminSession(headers = getRequestHeaders()) {
  const session = await getAuthSession(headers)

  if (session == null) {
    return null
  }

  const role = await ensureAdminRoleIfEligible(session.user)

  return {
    ...session,
    user: {
      ...session.user,
      role,
    },
  }
}

export async function requireAdminSession(headers = getRequestHeaders()) {
  const session = await getAdminSession(headers)

  if (session?.user.role !== 'admin') {
    return null
  }

  return session
}
