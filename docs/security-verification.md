# Security PR verification

React drafts reset when their source changes, feedback resets when its call changes, and endpoint results are scoped to the active session. The responsive hook subscribes to a media query with an SSR-safe snapshot. Lint and TypeScript pass; all 52 existing tests pass.

Checks use isolated test data. The Docker job builds without publishing or deploying. Live provider and production configuration checks remain an approved staging step before rollout.
