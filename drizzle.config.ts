import { defineConfig } from 'drizzle-kit'
import { resolveDbFileName } from './src/db/env'

export default defineConfig({
  dbCredentials: {
    url: resolveDbFileName(),
  },
  dialect: 'sqlite',
  out: './drizzle',
  schema: './src/db/schema.ts',
  strict: true,
  verbose: true,
})
