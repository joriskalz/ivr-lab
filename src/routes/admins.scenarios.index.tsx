import { createFileRoute } from '@tanstack/react-router'
import { AdminScenarioListPage } from '@/features/admin-softphone/admin-workspace'

export const Route = createFileRoute('/admins/scenarios/')({
  component: AdminScenarioListRouteComponent,
})

function AdminScenarioListRouteComponent() {
  return <AdminScenarioListPage />
}
