import { createFileRoute } from '@tanstack/react-router'
import { listSoftphoneScenarioIdsForUser } from '@/features/admin-softphone/queries'
import { normalizeAppUserRole } from '@/features/auth/roles'
import { getAdminSession } from '@/features/auth/session'
import { getSoftphoneServerConfig } from '@/features/softphone/server/config'
import { resolveSoftphoneExternalEndpointBundle } from '@/features/softphone/server/external-access'
import { jsonResponse } from '@/features/softphone/server/json'
import { getSoftphoneCaseSession } from '@/features/softphone/server/case-store'

getSoftphoneServerConfig()

async function canRevealExternalWriteSecret(request: Request, scenarioId: string) {
  const adminSession = await getAdminSession(request.headers)

  if (adminSession == null) {
    return false
  }

  if (normalizeAppUserRole(adminSession.user.role) === 'admin') {
    return true
  }

  return listSoftphoneScenarioIdsForUser(adminSession.user.id).includes(scenarioId)
}

export const Route = createFileRoute('/api/softphone/external-endpoints')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getSoftphoneCaseSession(request)

        if (session == null) {
          return jsonResponse({ error: 'Softphone session not initialized.' }, { status: 401 })
        }

        // The global write secret is only revealed to signed-in admins or
        // managers of this scenario; everyone else gets a placeholder so the
        // integration templates still render.
        const revealSecret = await canRevealExternalWriteSecret(request, session.scenario.id)

        return jsonResponse(resolveSoftphoneExternalEndpointBundle(session.correlationCode, { revealSecret }))
      },
    },
  },
})
