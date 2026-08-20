import { createFileRoute } from '@tanstack/react-router'
import { AdminUsersPage } from '@/features/admin-softphone/admin-workspace'

export const Route = createFileRoute('/admins/users')({
  component: AdminUsersRouteComponent,
})

function AdminUsersRouteComponent() {
  return <AdminUsersPage />
}
