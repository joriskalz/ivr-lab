import { createFileRoute } from '@tanstack/react-router'
import { AdminDeveloperInformationPage } from '@/features/admin-softphone/admin-workspace'

export const Route = createFileRoute('/admins/developer-information')({
  component: AdminDeveloperInformationRouteComponent,
})

function AdminDeveloperInformationRouteComponent() {
  return <AdminDeveloperInformationPage />
}
