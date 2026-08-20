import react from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// Mirrors the security headers applied by server.mjs in production so dev
// behaves like the deployed app (HSTS is intentionally omitted for localhost).
const devSecurityHeaders = {
  'content-security-policy': "frame-ancestors 'self'",
  'permissions-policy': 'camera=(), geolocation=(), microphone=(self)',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
}

export default defineConfig({
  plugins: [...tanstackStart(), tsconfigPaths(), react(), tailwindcss()],
  server: {
    headers: devSecurityHeaders,
  },
})
