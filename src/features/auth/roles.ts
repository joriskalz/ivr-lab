export const APP_USER_ROLES = ['admin', 'manager', 'reader', 'user'] as const

export type AppUserRole = (typeof APP_USER_ROLES)[number]

export const DEFAULT_APP_USER_ROLE: AppUserRole = 'user'

export function isAppUserRole(value: string | null | undefined): value is AppUserRole {
  return value != null && APP_USER_ROLES.includes(value as AppUserRole)
}

export function normalizeAppUserRole(value: string | null | undefined): AppUserRole {
  return isAppUserRole(value) ? value : DEFAULT_APP_USER_ROLE
}

export function canManageUsers(role: string | null | undefined) {
  return normalizeAppUserRole(role) === 'admin'
}

export function canCreateScenarios(role: string | null | undefined) {
  return normalizeAppUserRole(role) === 'admin'
}

export function canEditAssignedScenarios(role: string | null | undefined) {
  const normalizedRole = normalizeAppUserRole(role)
  return normalizedRole === 'admin' || normalizedRole === 'manager' || normalizedRole === 'user'
}

export function canViewAssignedScenarios(role: string | null | undefined) {
  return canEditAssignedScenarios(role)
}

export function canViewAssignedAnalytics(role: string | null | undefined) {
  const normalizedRole = normalizeAppUserRole(role)
  return normalizedRole === 'admin' || normalizedRole === 'manager' || normalizedRole === 'reader' || normalizedRole === 'user'
}
