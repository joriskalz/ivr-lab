import { createFileRoute } from '@tanstack/react-router'
import { AdminWorkspaceLayout } from '@/features/admin-softphone/admin-workspace'

export const Route = createFileRoute('/admins')({
  component: AdminsRouteComponent,
})

function AdminsRouteComponent() {
  return <AdminWorkspaceLayout />
}
