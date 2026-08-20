import type { SoftphoneCallHistoryEntry } from '@/features/softphone/call-history'
import type { AppUserRole } from '@/features/auth/roles'
import type { SoftphoneScenarioConfig, SoftphoneTestScenarioRecord } from '@/features/softphone/types'

export type AdminAuthProvider = 'github' | 'google'

export interface AdminOperatorSnapshot {
  email: string | null
  id: string | null
  image: string | null
  name: string | null
  role: AppUserRole | null
}

export interface AdminSoftphoneHistoryEntry extends SoftphoneCallHistoryEntry {
  operator: AdminOperatorSnapshot | null
}

export interface PersistAdminSoftphoneCallInput {
  call: SoftphoneCallHistoryEntry
}

export interface PersistSoftphoneTestScenarioInput {
  accessKey?: string | null
  config: SoftphoneScenarioConfig
  id?: string | null
  name: string
}

export interface PersistSoftphoneScenarioManagersInput {
  scenarioId: string
  userIds: string[]
}

export interface DeleteSoftphoneTestScenarioInput {
  scenarioId: string
}

export interface DeleteAdminSoftphoneScenarioHistoryInput {
  scenarioId: string
}

export interface AdminViewerSnapshot {
  email: string
  id: string
  image: string | null
  name: string
  role: AppUserRole
}

export interface AdminWorkspacePermissions {
  canCreateScenarios: boolean
  canEditScenarios: boolean
  canManageUsers: boolean
  canViewAnalytics: boolean
  canViewScenarios: boolean
}

export interface AdminScenarioManagerUser {
  email: string
  id: string
  image: string | null
  managedScenarioIds: string[]
  name: string
  role: AppUserRole | null
}

export type AdminSoftphoneDashboardData =
  | {
      providers: AdminAuthProvider[]
      status: 'forbidden'
      viewer: AdminViewerSnapshot
    }
  | {
      permissions: AdminWorkspacePermissions
      providers: AdminAuthProvider[]
      status: 'authorized'
      history: AdminSoftphoneHistoryEntry[]
      scenarios: SoftphoneTestScenarioRecord[]
      users: AdminScenarioManagerUser[]
      viewer: AdminViewerSnapshot
    }
  | {
      providers: AdminAuthProvider[]
      status: 'unauthenticated'
    }
