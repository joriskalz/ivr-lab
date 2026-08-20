import { relations, sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { SoftphoneCallFeedback, SoftphoneCallHistoryEntry } from '@/features/softphone/call-history'
import type { SoftphoneProfileSnapshot, SoftphoneScenarioConfig } from '@/features/softphone/types'

const nowExpression = sql`(cast(unixepoch('subsecond') * 1000 as integer))`

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(nowExpression),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().default(nowExpression).$onUpdate(() => new Date()),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(nowExpression),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().default(nowExpression).$onUpdate(() => new Date()),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => ({
  userIdIdx: index('session_user_id_idx').on(table.userId),
}))

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(nowExpression),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().default(nowExpression).$onUpdate(() => new Date()),
}, (table) => ({
  providerAccountIdx: uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId),
  userIdIdx: index('account_user_id_idx').on(table.userId),
}))

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(nowExpression),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().default(nowExpression).$onUpdate(() => new Date()),
}, (table) => ({
  identifierIdx: index('verification_identifier_idx').on(table.identifier),
}))

export const adminSoftphoneCalls = sqliteTable('admin_softphone_calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientEntryId: text('clientEntryId').notNull().unique(),
  sessionId: text('sessionId'),
  correlationCode: text('correlationCode'),
  callIdentifier: text('callIdentifier'),
  profileId: text('profileId'),
  profileName: text('profileName'),
  profileSnapshot: text('profileSnapshot', { mode: 'json' }).$type<SoftphoneProfileSnapshot | null>(),
  operatorUserId: text('operatorUserId').references(() => user.id, { onDelete: 'set null' }),
  operatorName: text('operatorName'),
  operatorEmail: text('operatorEmail'),
  operatorImage: text('operatorImage'),
  operatorRole: text('operatorRole'),
  startedAt: text('startedAt').notNull(),
  endedAt: text('endedAt').notNull(),
  finalCallState: text('finalCallState'),
  totalDurationMs: integer('totalDurationMs').notNull().default(0),
  totalDurationWithoutInitMs: integer('totalDurationWithoutInitMs').notNull().default(0),
  callPayload: text('callPayload', { mode: 'json' }).$type<SoftphoneCallHistoryEntry>().notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
}, (table) => ({
  endedAtIdx: index('admin_softphone_calls_ended_at_idx').on(table.endedAt),
  operatorEmailIdx: index('admin_softphone_calls_operator_email_idx').on(table.operatorEmail),
  profileIdIdx: index('admin_softphone_calls_profile_id_idx').on(table.profileId),
  sessionIdIdx: index('admin_softphone_calls_session_id_idx').on(table.sessionId),
}))

export const softphoneTestScenarios = sqliteTable('softphone_test_scenarios', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  accessKey: text('accessKey').notNull().default('00000'),
  config: text('config', { mode: 'json' }).$type<SoftphoneScenarioConfig>().notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
}, (table) => ({
  accessKeyIdx: index('softphone_test_scenarios_access_key_idx').on(table.accessKey),
  nameIdx: index('softphone_test_scenarios_name_idx').on(table.name),
}))

export const softphoneScenarioManagers = sqliteTable('softphone_scenario_managers', {
  scenarioId: text('scenarioId').notNull().references(() => softphoneTestScenarios.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.scenarioId, table.userId], name: 'softphone_scenario_managers_pk' }),
  scenarioIdIdx: index('softphone_scenario_managers_scenario_id_idx').on(table.scenarioId),
  userIdIdx: index('softphone_scenario_managers_user_id_idx').on(table.userId),
}))

export const adminSoftphoneFeedback = sqliteTable('admin_softphone_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  callId: integer('callId').notNull().references(() => adminSoftphoneCalls.id, { onDelete: 'cascade' }).unique(),
  sentiment: text('sentiment'),
  phaseGroup: text('phaseGroup'),
  severityRating: integer('severityRating'),
  submittedAt: text('submittedAt'),
  feedbackPayload: text('feedbackPayload', { mode: 'json' }).$type<SoftphoneCallFeedback | null>(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
}, (table) => ({
  sentimentIdx: index('admin_softphone_feedback_sentiment_idx').on(table.sentiment),
  submittedAtIdx: index('admin_softphone_feedback_submitted_at_idx').on(table.submittedAt),
}))

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  adminSoftphoneCalls: many(adminSoftphoneCalls),
  sessions: many(session),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const adminSoftphoneCallRelations = relations(adminSoftphoneCalls, ({ one }) => ({
  feedback: one(adminSoftphoneFeedback, {
    fields: [adminSoftphoneCalls.id],
    references: [adminSoftphoneFeedback.callId],
  }),
  operator: one(user, {
    fields: [adminSoftphoneCalls.operatorUserId],
    references: [user.id],
  }),
}))

export const adminSoftphoneFeedbackRelations = relations(adminSoftphoneFeedback, ({ one }) => ({
  call: one(adminSoftphoneCalls, {
    fields: [adminSoftphoneFeedback.callId],
    references: [adminSoftphoneCalls.id],
  }),
}))

export const schema = {
  account,
  adminSoftphoneCalls,
  adminSoftphoneFeedback,
  session,
  softphoneScenarioManagers,
  softphoneTestScenarios,
  user,
  verification,
}
