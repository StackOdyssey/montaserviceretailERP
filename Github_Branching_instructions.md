# Permanent Instruction: Git Branching & Production Deployment Strategy (Solo Dev)

You must strictly follow this Git workflow for all future development, feature implementation, bug fixes, and production deployments in this ERP project.

This is a **solo-developer workflow**: there is no reviewer other than the owner. The Pull Request gate of classic GitHub Flow is therefore replaced by an explicit **owner approval checkpoint** — same protection, no ceremony.

## 1. Core Development Strategy

Follow a **Feature Branch Workflow adapted from GitHub Flow** for a single developer, combined with production release tagging and manual controlled deployment.

The primary objectives are:
- Keep production code stable at all times.
- Isolate every new feature from production.
- Prevent unfinished or untested code from reaching production.
- Maintain reliable production checkpoints.
- Make it possible to recover quickly from faulty commits or deployments — every deploy must be traceable to a branch + commit + Cloud Run revision.
- Preserve a clean and traceable Git history.

## 2. Branching Structure

Use the following branch conventions:

### `main`
- Represents the stable production version.
- Must always contain deployable, tested code.
- Never develop features directly on this branch.
- Never push experimental or unfinished code directly to this branch.
- Only receive changes from verified, approved feature/hotfix branches.
- Exception: small docs-only or typo commits may go straight to `main`; anything touching runtime code goes through a branch.

### `feature/*`
Create a dedicated branch for every new feature or substantial enhancement.

Naming convention:
- `feature/g21-payment-modes`
- `feature/catalogue-view`
- `feature/supplier-management`
- `feature/customer-management`

Each feature must be developed, committed, and tested independently.

### `hotfix/*`
Use dedicated branches for urgent production bug fixes.

Examples:
- `hotfix/invoice-calculation`
- `hotfix/authentication-bug`
- `hotfix/stock-quantity-error`

Hotfixes follow the same approval checkpoint as features before merging into `main`.

## 3. Mandatory Feature Development Workflow

Whenever I request a new feature or substantial modification:

1. Check the current Git status and identify the current branch.
2. Verify that the working tree is clean before switching branches. Never overwrite or discard uncommitted user changes.
3. Synchronize with the latest remote `main`.
4. Create a dedicated `feature/*` branch from the latest stable `main`.
5. Implement the requested feature exclusively within that branch.
6. Keep changes focused on the requested feature. Avoid unrelated modifications.
7. Commit changes using descriptive commit messages.
8. Push the feature branch to GitHub (for backup and history — a formal PR is optional, not required).
9. Run the relevant tests, build checks, and validation procedures (see §4).
10. Report the implementation status, branch name, commits, and test results.
11. **Wait for my approval before merging into `main` or triggering a production deployment.**

Do not automatically merge feature branches into `main` or deploy them.

## 4. Merge Policy

Since there is a single developer, a formal GitHub Pull Request is **not required**. The owner approval checkpoint in §3.11 is the merge gate.

Before requesting a merge:
- Verify that the feature works as expected on the dev environment (dev Neon branch + local `next dev`).
- Run the production build (`npm run build`) and `npx tsc --noEmit -p .`.
- Run relevant automated tests.
- Check for TypeScript, linting, database, and migration errors where applicable (lint has known pre-existing issues — only check touched files).
- Review the changes against the latest `main`.
- Resolve merge conflicts carefully without discarding existing functionality.
- If the feature includes a schema change, prepare the migration and note it for the deploy step.

Never merge a feature with known critical errors.

## 5. Production Deployment Rules

Google Cloud Run (`erp-system`, project `erp-syste`, europe-west1) is the production hosting environment.

Deploys are **manual and intentional** — `gcloud run deploy erp-system --source .` from the local `main` checkout. There is deliberately no GitHub trigger; the approval checkpoint replaces the pipeline gate.

Rules:
- Deploy only from a verified, merged commit on `main` — never from feature or hotfix branches.
- Every production deployment requires my explicit approval.
- Database migrations must be reviewed before production execution, and applied to prod **before or with** the deploy (deploys do not auto-migrate — prod `DATABASE_URL` via Neon MCP `get_connection_string`, unpooled host for DDL).
- Deployment success must be verified live (login + affected page + console check via IronBee) before considering a release complete.
- Record branch + commit + Cloud Run revision in `LEGACY_MEGAPLAN_TRACKER.md`'s Done log (or the active tracker).

## 6. Production Versioning and Checkpoints

Use Git tags to identify stable production releases.

Follow Semantic Versioning:

- `v1.0.0`: First tagged baseline.
- `v1.1.0`: New backward-compatible feature.
- `v1.1.1`: Backward-compatible bug fix.
- `v2.0.0`: Breaking change.

After each successful production deployment, create an annotated Git tag on the deployed commit.

Example:

`git tag -a v1.2.0 -m "Production release: payment modes (G21) — erp-system-00119-xxx"`

Push the tag to GitHub.

Never tag an untested or undeployed commit as a production release.

## 7. Rollback and Recovery Strategy

If a production deployment introduces an issue:

**First option: Google Cloud Run rollback**
- Identify the last known working Cloud Run revision (`gcloud run revisions list`).
- Restore traffic to the previous working revision.
- Verify production functionality.

**Second option: Git rollback**
- Identify the faulty commit or release (tags map releases to commits).
- Prefer `git revert` to create a new corrective commit.
- Merge and deploy only after verification and approval.

Never use `git reset --hard`, force-push, or history rewriting on `main` as a routine rollback procedure.

Remember that reverting application code does not automatically reverse database migrations. Database recovery must be handled separately and carefully (Neon branch restore).

## 8. Test Environment

The **dev Neon branch** (`.env.local` `DATABASE_URL`) plus local `next dev` serves as the pre-production environment: feature verification, migration testing, and business-workflow validation happen there before merge.

A dedicated Cloud Run staging service is deferred — do not assume one exists.

## 9. Mandatory Safety Rules

These rules override convenience or speed:

1. Never develop features directly on `main` (docs/typos excepted).
2. Never push unfinished features to `main`.
3. Never deploy from feature or hotfix branches.
4. Never merge without running relevant checks.
5. Never deploy to production without my explicit approval.
6. Never discard uncommitted changes without my permission.
7. Never rewrite production Git history.
8. Never create a production release tag before successful deployment.
9. Never execute destructive database migrations without explicit authorization and a verified recovery plan.
10. Never assume a deployment succeeded — verify it live.

## 10. Communication and Reporting

At the beginning of each new development task, briefly report:

- Current branch.
- Current Git status.
- Latest production release/tag and Cloud Run revision, if available.
- Proposed feature branch name.

After implementation, report:

- Feature implemented.
- Branch used.
- Commits created.
- Tests and build results.
- GitHub push status.
- Whether production deployment is pending approval.

**Final principle: Production stability takes priority over development speed. Every feature must remain isolated until it has been tested, verified, and explicitly approved for production.**

These instructions are permanent project-level development rules. Apply them automatically to all future coding tasks unless I explicitly authorize an exception.
