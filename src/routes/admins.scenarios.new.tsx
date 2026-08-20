import { createFileRoute } from '@tanstack/react-router'
import { AdminScenarioEditorPage } from '@/features/admin-softphone/admin-workspace'

export const Route = createFileRoute('/admins/scenarios/new')({
  component: AdminScenarioNewRouteComponent,
})

function AdminScenarioNewRouteComponent() {
  return <AdminScenarioEditorPage scenarioId={null} />
}
