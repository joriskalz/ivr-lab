import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from '@tanstack/react-router'
import { SoftphonePublicLanding } from '@/features/softphone/public-landing'
import { getViewerRouteAccess } from '@/features/auth/access'

export const Route = createFileRoute('/')({
  component: IndexRouteComponent,
})

function IndexRouteComponent() {
  const viewerAccessQuery = useQuery({
    queryFn: () => getViewerRouteAccess(),
    queryKey: ['viewer-route-access'],
  })

  if (viewerAccessQuery.data?.isAuthenticated) {
    return <Navigate to="/admins/scenarios" />
  }

  return <SoftphonePublicLanding />
}
