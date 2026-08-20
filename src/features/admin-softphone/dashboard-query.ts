import { queryOptions } from '@tanstack/react-query'
import { getAdminSoftphoneDashboard } from '@/features/admin-softphone/server'

export const adminSoftphoneDashboardQueryOptions = queryOptions({
  queryFn: () => getAdminSoftphoneDashboard(),
  queryKey: ['admin-softphone-dashboard'] as const,
})
