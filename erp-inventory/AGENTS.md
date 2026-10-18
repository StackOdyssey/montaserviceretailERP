<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes (BM Motors ERP)

- Verify: `npx tsc --noEmit -p .`, `npm run build`, `npm run db:migrate` (dev Neon branch from `.env.local`). Lint has pre-existing errors (no-unescaped-entities, AppShell hooks) — only check files you touched.
- Money tests: `money.test.ts` uses an extensionless import; run via a temp copy that rewrites `./money` → `./money.ts`, then `node --experimental-strip-types --test`.
- Port 3000 is often taken by another local app: run `npx next dev -p 3100`.
- Every exported Server Action must call `assertAuthenticated()` (`src/lib/action-guard.ts`). Unauthenticated layout reads live in `src/lib/queries/layout.ts` (not `"use server"`).
- Any transaction that reads then rewrites `products.currentStock/cmupCents` must call `lockProducts(tx, ids)` (`src/lib/stock-lock.ts`) first.
- Sessions: HMAC via `node:crypto` (proxy runs on Node in Next 16); `settings.session_version` revokes all sessions.
