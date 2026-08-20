export function jsonResponse(payload: unknown, init?: ResponseInit) {
  // Merge via the Headers API: object-spreading a Headers instance yields
  // nothing and silently drops headers such as set-cookie.
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json')

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  })
}
