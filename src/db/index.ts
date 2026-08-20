import '@tanstack/react-start/server-only'
import { createRequire } from 'node:module'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import { resolveDbFileName } from '@/db/env'
import * as schema from '@/db/schema'

const DATABASE_INSTANCE_KEY = '__contosoIvrLabDb'
const SQLITE_INSTANCE_KEY = '__contosoIvrLabSqlite'
const require = createRequire(import.meta.url)

type GlobalWithDb = typeof globalThis & {
  [DATABASE_INSTANCE_KEY]?: unknown
  [SQLITE_INSTANCE_KEY]?: { close: (throwOnError?: boolean) => void }
}

function createDatabaseHandle(): { db: DatabaseHandle; sqlite: { close: (throwOnError?: boolean) => void } } {
  const dbFileName = resolveDbFileName()

  if (typeof Bun !== 'undefined') {
    const { Database } = require('bun:sqlite') as typeof import('bun:sqlite')
    const { drizzle } = require('drizzle-orm/bun-sqlite') as typeof import('drizzle-orm/bun-sqlite')
    const sqlite = new Database(dbFileName, { create: true })

    return {
      db: drizzle(sqlite, { schema }),
      sqlite,
    }
  }

  const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3')
  const { drizzle } = require('drizzle-orm/better-sqlite3') as typeof import('drizzle-orm/better-sqlite3')
  const sqlite = new BetterSqlite3(dbFileName)

  return {
    db: drizzle(sqlite, { schema }),
    sqlite: {
      close(throwOnError = false) {
        sqlite.close()
        return throwOnError
      },
    },
  }
}

type DatabaseHandle = BaseSQLiteDatabase<'sync', unknown, typeof schema>

export function getDb() {
  const globalWithDb = globalThis as GlobalWithDb

  if (globalWithDb[DATABASE_INSTANCE_KEY] == null) {
    const { db, sqlite } = createDatabaseHandle()
    globalWithDb[SQLITE_INSTANCE_KEY] = sqlite
    globalWithDb[DATABASE_INSTANCE_KEY] = db
  }

  return globalWithDb[DATABASE_INSTANCE_KEY] as DatabaseHandle
}

export function __resetDbForTests() {
  const globalWithDb = globalThis as GlobalWithDb

  globalWithDb[SQLITE_INSTANCE_KEY]?.close(false)
  delete globalWithDb[SQLITE_INSTANCE_KEY]
  delete globalWithDb[DATABASE_INSTANCE_KEY]
}
