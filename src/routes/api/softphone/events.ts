import { createFileRoute } from '@tanstack/react-router'
import { getSoftphoneCaseState } from '@/features/softphone/server/case-store'
import { getSoftphoneServerConfig } from '@/features/softphone/server/config'
import { subscribeToSoftphoneCaseState } from '@/features/softphone/server/events'

const SOFTPHONE_SSE_KEEPALIVE_MS = 15_000

getSoftphoneServerConfig()

function encodeSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export const Route = createFileRoute('/api/softphone/events')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Authorization comes from the softphone session cookie (or the
        // session header); a session id in the URL is never trusted on its own.
        const result = getSoftphoneCaseState(request)

        if (result == null) {
          return new Response(JSON.stringify({ error: 'Softphone session not initialized.' }), {
            headers: {
              'content-type': 'application/json; charset=utf-8',
            },
            status: 401,
          })
        }

        const requestedSessionId = new URL(request.url).searchParams.get('sessionId')?.trim() ?? ''

        if (requestedSessionId && requestedSessionId !== result.session.sessionId) {
          return new Response(JSON.stringify({ error: 'Softphone session mismatch.' }), {
            headers: {
              'content-type': 'application/json; charset=utf-8',
            },
            status: 403,
          })
        }

        const encoder = new TextEncoder()
        let closeStream = (_closeController = true) => {
          void _closeController
        }

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            let closed = false
            let keepaliveTimer: ReturnType<typeof setInterval> | null = null
            let unsubscribe = () => {}

            closeStream = (closeController = true) => {
              if (closed) {
                return
              }

              closed = true

              if (keepaliveTimer != null) {
                clearInterval(keepaliveTimer)
                keepaliveTimer = null
              }

              unsubscribe()

              if (closeController) {
                controller.close()
              }
            }

            const pushCaseState = (caseState: typeof result.payload) => {
              if (closed) {
                return
              }

              controller.enqueue(encoder.encode(encodeSseEvent('case-state', caseState)))
            }

            unsubscribe = subscribeToSoftphoneCaseState(result.session.sessionId, pushCaseState)

            pushCaseState(result.payload)

            keepaliveTimer = setInterval(() => {
              if (closed) {
                return
              }

              controller.enqueue(encoder.encode(': keepalive\n\n'))
            }, SOFTPHONE_SSE_KEEPALIVE_MS)

            request.signal.addEventListener('abort', () => closeStream(), { once: true })
          },
          cancel() {
            closeStream(false)
          },
        })

        return new Response(stream, {
          headers: {
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
            'content-type': 'text/event-stream; charset=utf-8',
            'x-accel-buffering': 'no',
          },
        })
      },
    },
  },
})
