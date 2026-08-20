import { createFileRoute } from '@tanstack/react-router'
import { getSoftphoneScenarioPreviewServer } from '@/features/softphone/server/preview'
import { SoftphonePage } from '@/features/softphone/softphone-page'

export const Route = createFileRoute('/softphone/$scenarioId')({
  loader: ({ params }) => getSoftphoneScenarioPreviewServer({ data: { scenarioId: params.scenarioId } }),
  component: SoftphoneScenarioRoute,
})

function SoftphoneScenarioRoute() {
  const { scenarioId } = Route.useParams()
  const initialScenarioPreview = Route.useLoaderData()

  return <SoftphonePage initialScenarioPreview={initialScenarioPreview} scenarioId={scenarioId.toUpperCase()} />
}
