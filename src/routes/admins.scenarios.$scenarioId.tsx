import { createFileRoute } from '@tanstack/react-router'
import { AdminScenarioEditorPage } from '@/features/admin-softphone/admin-workspace'

export const Route = createFileRoute('/admins/scenarios/$scenarioId')({
  component: AdminScenarioEditorRouteComponent,
})

function AdminScenarioEditorRouteComponent() {
  const { scenarioId } = Route.useParams()

  return <AdminScenarioEditorPage scenarioId={scenarioId} />
}
