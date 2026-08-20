import { createFileRoute } from '@tanstack/react-router'

// Liveness probe for container orchestrators and the Docker HEALTHCHECK.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ status: 'ok' }), {
          headers: {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
          },
        }),
    },
  },
})
