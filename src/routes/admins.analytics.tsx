import { createFileRoute } from '@tanstack/react-router'
import { AdminAnalyticsPage } from '@/features/admin-softphone/admin-workspace'

export const Route = createFileRoute('/admins/analytics')({
  component: AdminAnalyticsRouteComponent,
})

function AdminAnalyticsRouteComponent() {
  return <AdminAnalyticsPage />
}
