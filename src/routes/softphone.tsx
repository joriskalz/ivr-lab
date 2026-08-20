import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { SoftphonePublicLanding } from '@/features/softphone/public-landing'

export const Route = createFileRoute('/softphone')({
  component: SoftphoneLandingPage,
})

function SoftphoneLandingPage() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname !== '/softphone' && pathname !== '/softphone/') {
    return <Outlet />
  }

  return <SoftphonePublicLanding />
}
