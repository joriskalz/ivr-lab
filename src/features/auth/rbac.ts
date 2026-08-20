import '@tanstack/react-start/server-only'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { user } from '@/db/schema'
import { resolveAdminEmailAllowlist } from '@/features/auth/env'
import { normalizeAppUserRole, type AppUserRole } from '@/features/auth/roles'

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? ''
}

export function isAllowlistedAdminEmail(email: string | null | undefined) {
  const normalizedEmail = normalizeEmail(email)

  if (!normalizedEmail) {
    return false
  }

  return resolveAdminEmailAllowlist().includes(normalizedEmail)
}

export async function ensureAdminRoleIfEligible(currentUser: {
  email?: string | null
  id: string
  role?: string | null
}): Promise<AppUserRole> {
  if (currentUser.role === 'admin') {
    return 'admin' as const
  }

  if (isAllowlistedAdminEmail(currentUser.email)) {
    getDb().update(user).set({ role: 'admin' }).where(eq(user.id, currentUser.id)).run()
    return 'admin' as const
  }

  return normalizeAppUserRole(currentUser.role)
}
