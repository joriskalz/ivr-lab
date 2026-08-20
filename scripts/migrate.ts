import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { isAbsolute, resolve } from 'node:path'

function resolveDbFileName() {
  const configuredFileName = process.env.DB_FILE_NAME?.trim()

  if (!configuredFileName) {
    return resolve(process.cwd(), '.data/app.db')
  }

  return isAbsolute(configuredFileName)
    ? configuredFileName
    : resolve(process.cwd(), configuredFileName)
}

const sqlite = new Database(resolveDbFileName(), { create: true })
const db = drizzle(sqlite)

migrate(db, {
  migrationsFolder: resolve(process.cwd(), 'drizzle'),
})
