import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { __resetDbForTests, getDb } from '@/db'
import { user } from '@/db/schema'
import { ensureAdminRoleIfEligible } from '@/features/auth/rbac'

const TEST_DB_FILE = resolve(process.cwd(), '.data/test-auth-rbac.sqlite')
const ORIGINAL_DB_FILE_NAME = process.env.DB_FILE_NAME
const ORIGINAL_ADMIN_EMAILS = process.env.AUTH_ADMIN_EMAILS

function runMigrations() {
  mkdirSync(dirname(TEST_DB_FILE), { recursive: true })
  const sqlite = new Database(TEST_DB_FILE, { create: true })
  const db = drizzle(sqlite)
  migrate(db, {
    migrationsFolder: resolve(process.cwd(), 'drizzle'),
  })
  sqlite.close(false)
}

describe('auth RBAC', () => {
  beforeEach(() => {
    process.env.DB_FILE_NAME = TEST_DB_FILE
    delete process.env.AUTH_ADMIN_EMAILS
    rmSync(TEST_DB_FILE, { force: true })
    __resetDbForTests()
    runMigrations()
  })

  afterEach(() => {
    __resetDbForTests()
    rmSync(TEST_DB_FILE, { force: true })

    if (ORIGINAL_DB_FILE_NAME == null) {
      delete process.env.DB_FILE_NAME
    } else {
      process.env.DB_FILE_NAME = ORIGINAL_DB_FILE_NAME
    }

    if (ORIGINAL_ADMIN_EMAILS == null) {
      delete process.env.AUTH_ADMIN_EMAILS
    } else {
      process.env.AUTH_ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS
    }
  })

  test('does not auto-promote the first signed-in user when no allowlist exists', async () => {
    getDb().insert(user).values({
      email: 'first@example.com',
      emailVerified: true,
      id: 'user-1',
      name: 'First User',
      role: 'user',
    }).run()

    const role = await ensureAdminRoleIfEligible({
      email: 'first@example.com',
      id: 'user-1',
      role: 'user',
    })

    const storedUser = getDb().select().from(user).all()

    expect(role).toBe('user')
    expect(storedUser[0]?.role).toBe('user')
  })

  test('promotes allowlisted emails to admin', async () => {
    process.env.AUTH_ADMIN_EMAILS = 'allowed@example.com'

    getDb().insert(user).values({
      email: 'allowed@example.com',
      emailVerified: true,
      id: 'user-3',
      name: 'Allowed User',
      role: 'user',
    }).run()

    const role = await ensureAdminRoleIfEligible({
      email: 'allowed@example.com',
      id: 'user-3',
      role: 'user',
    })

    const storedUser = getDb().select().from(user).all()

    expect(role).toBe('admin')
    expect(storedUser[0]?.role).toBe('admin')
  })

  test('preserves existing non-admin roles for non-allowlisted users', async () => {
    process.env.AUTH_ADMIN_EMAILS = 'allowed@example.com'

    const role = await ensureAdminRoleIfEligible({
      email: 'manager@example.com',
      id: 'user-4',
      role: 'manager',
    })

    expect(role).toBe('manager')
  })

  test('restricts admin promotion to the configured allowlist', async () => {
    process.env.AUTH_ADMIN_EMAILS = 'allowed@example.com'

    getDb().insert(user).values({
      email: 'blocked@example.com',
      emailVerified: true,
      id: 'user-2',
      name: 'Blocked User',
      role: 'user',
    }).run()

    const role = await ensureAdminRoleIfEligible({
      email: 'blocked@example.com',
      id: 'user-2',
      role: 'user',
    })

    expect(role).toBe('user')
  })
})
