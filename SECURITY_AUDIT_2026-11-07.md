# Security & Integrity Audit — BM Motors ERP (2026-11-07)

Read-only audit per `erp-audit-prompt.md`. Evidence: source code, live Cloud Run config (`gcloud run services describe`, read-only), `npm audit`, live response headers, read-only prod SQL.
**UNTRACKED by design — do not commit** (describes exploitable weaknesses).

> Excluded by owner decision: the Phase E opening-balance documents (99 BLs dated 2026-11-04) are legitimate legacy balances and are **not** a finding.

---

## 1. Executive summary

- **Cloud Run exposure: PUBLIC (confirmed)** — `run.googleapis.com/invoker-iam-disabled: 'true'` + `ingress: all`. The app PIN login is the only barrier.
- **Compromise / data-loss today?** Data loss: low (nightly encrypted R2 backups succeed daily + Neon PITR). Compromise: moderate — the PIN lockout can be bypassed per-IP, credentials were exposed, and the runtime identity has project-Editor rights.

**Top issues**
1. SEC-004 — exposed credentials (legacy login committed in AGENTS.md; prod DB password typed in plaintext on 2026-11-04; Gemini/Browserbase keys in git history).
2. SEC-003 — per-IP PIN lockout bypass via spoofed `X-Forwarded-For` + global lockout DoS.
3. OPS-001 — every push to `main` auto-deploys; build + runtime use the default compute SA with `roles/editor`.
4. SEC-001 — Next.js 16.3.8 critical advisories (Server Actions DoS applicable).
5. SEC-007 — `changeMyPin` "PIN already used" oracle → cashier can discover an owner PIN.

## 2. Architecture

- Next 16.3.8 App Router · React 19.2.8 · Drizzle · Neon Postgres · R2 storage · Resend email.
- Auth: HMAC-signed `bm_session` cookie (HttpOnly, Secure, SameSite=Lax, 30 d), global session version + per-user `is_active` revocation.
- No `route.ts` handlers — **107 exported Server Actions**; 105 guarded (`assertAuthenticated` / `assertOwner`, inline or in `*Impl`), 13 owner-only; only `loginWithPin`/`checkSession` unguarded (correct). Proxy is not the sole control.

| Cloud Run | Value | Note |
|---|---|---|
| Invoker IAM | disabled | PUBLIC |
| Ingress | all | |
| Service account | `1046319022554-compute@developer` | default SA, roles/editor + run.admin |
| Scaling | min 0 / max 3, concurrency 80 | max cap limits bill floods; POS cold starts |
| Timeout / resources | 300 s · 1 CPU / 1 GiB · cpu-throttling | |
| Secrets | Secret Manager (DATABASE_URL, ADMIN_PIN, SESSION_SECRET, R2 keys) | good |
| Image | pinned to commit SHA | good |
| Deploy | Cloud Build trigger `56a747b1` on `^main$` | undocumented — docs say manual deploys |

## 3. Findings register

### SEC-004 — Exposed credentials · High · Confirmed
- `erp-inventory/AGENTS.md:101` — `MONTA_USER=Montassir MONTA_PASS=1234****` committed + pushed (commit `03eb238`).
- Prod Neon connection string (`npg_****`) passed in plaintext on the command line during the 2026-11-04 import (session logs / shell history, not git).
- ~~`GEMINI_API_KEY` / `BROWSERBASE_API_KEY` in git history~~ — **false positive**: history scan shows only env var names + empty `.env.example` lines; keys never committed.
- **Impact:** anyone with repo/log access can log into the legacy ERP or the prod database directly (bypassing all app controls).
- **Fix:** rotate all four; replace literal with `$MONTA_PASS` in AGENTS.md. · Effort S

### SEC-003 — PIN brute-force lockout bypass + lockout DoS · High · Confirmed
- `src/lib/actions/auth.ts` `clientIp()`: `h.get("x-forwarded-for")?.split(",")[0]` — left-most XFF is client-controlled on Cloud Run.
- Each request with a fresh fake IP resets the 5-failure per-IP counter. Remaining limit = global 40/15 min ≈ 3 840 guesses/day → a 4-digit PIN falls in ~3 days.
- 40 bad PINs every 15 min locks the legitimate owner out indefinitely.
- **Fix:** use the right-most (GFE-appended) client IP; ADMIN_PIN ≥ 8 digits; exponential backoff; ideally IAP in front. · Effort S

### OPS-001 — Auto-deploy on every push + over-privileged service account · High · Confirmed
- Trigger `rmgpgab-erp-system-europe-west1-StackOdyssey-erp-system--majcz` deploys every push to `main` (including docs-only commits; prod currently = docs commit `8aba48f`).
- Build and runtime both use the default compute SA holding `roles/editor`, `roles/run.admin`, `roles/iam.serviceAccountUser`.
- **Impact:** any app-level RCE = full GCP project control; the documented "approval checkpoint" is not enforced by infra.
- **Fix:** dedicated runtime SA (secretAccessor on its 6 secrets only) + dedicated deploy SA; restrict or remove the trigger and align docs. · Effort M

### SEC-001 — Next.js advisories · High (escalated: public service) · Confirmed
- `npm audit`: `next 16.0.0–16.4.0` critical. Applicable: **Server Actions DoS (GHSA-p3m5-59mp-jv5r)**. Not reachable: image-optimizer SVG RCE (`images.unoptimized: true`), `use cache` RCE (not used). CVE-2025-29927 / CVE-2025-55182: appear patched in pinned versions (verify against official advisories).
- `dompurify` ≤3.4.16 critical (transitive, client-side via jspdf).
- **Fix:** `next@16.4.5` + `eslint-config-next@16.4.5`; `npm audit fix`. · Effort S

### SEC-007 — PIN discovery oracle in `changeMyPin` · Medium · Confirmed
- `src/lib/actions/profile.ts`: unsalted unique `pin_hmac` + message "Ce PIN est déjà utilisé par un autre compte", no rate limit.
- **Impact:** an authenticated CAISSIER iterates PINs until the message appears → learns a GERANT PIN → escalates to owner.
- **Fix:** generic error message + per-user attempt limit. · Effort S

### SEC-005 — Missing security headers · Medium · Confirmed
- Live `/login`: no HSTS, no CSP, no `X-Frame-Options`/`frame-ancestors` (clickjacking on POS), no Referrer-Policy / Permissions-Policy; `x-powered-by: Next.js` exposed.
- **Fix:** `next.config.ts` `headers()` + `poweredByHeader: false`. · Effort S

### BIZ-002 — Credit-balance compensations recorded as cash today · Medium · Likely
- The 2 compensating payments (HICHAM AZAZ 13 823 + ABDERRAHMANE ARIHA 1 390) were inserted as `ESPECES` / `ENCAISSE` dated 2026-11-04 → the Nov 4 feuille de journée likely shows 15 213 DH espèces never received in the till.
- **Verify:** /comptabilite → Feuille de journée 2026-11-04.
- **Fix:** reclassify (e.g. method `VERSEMENT`/`AVOIR` note, or back-date to legacy period) so it no longer appears as till cash. · Effort S

### BIZ-003 — No audit trail for the import · Low · Confirmed
- 99 docs + 469 payments written by `scripts/import-legacy-balances.mjs` with no `audit_logs` rows.
- **Fix:** one `IMPORT_LEGACY` audit row summarising counts/totals/script commit. · Effort S

### SEC-006 — Session hygiene · Low · Confirmed
- 30-day sessions, no idle timeout; `revokeAllSessions` only needs `assertAuthenticated` (cashier can log everyone out).

### OPS-002 — CI hardening · Low · Confirmed
- `.github/workflows/nightly-backup.yml` actions pinned by tag (`@v4`), not SHA; `permissions:` not reviewed.

## 4. Positive observations
- Server-side price resolution, fail-closed off-catalogue prices (motif required); totals recomputed server-side.
- Sale idempotency key, `lockProducts` row locks, atomic `NULLS NOT DISTINCT` numbering upsert (prod BL counter verified at 100 — no collision with imported BLs).
- No `dangerouslySetInnerHTML`; single `sql.raw` uses a whitelisted column.
- Runtime secrets from Secret Manager; non-root multi-stage container; image pinned to SHA.
- Nightly encrypted R2 backups succeeding (Nov 5/6/7) + restore-drill script.
- `ActionResult` whitelist prevents internal error leakage.

## 5. Coverage
- Done: Phase 0, A, B, E, F, I, S1, S2, key S4, Phase 5 backups.
- Partial: C (zod sampled, not every action), D (grep-level), Phase 2 (stock/money/numbering; full state machines not traced), Phases 3/4/6.
- Not assessable: GitHub branch protection / secret scanning, Neon plan PITR window, GCP org policies, Cloud Logging contents/retention, actual ADMIN_PIN length.

---

# Remediation plan — step by step

Each code step = own `feature/*` or `hotfix/*` branch → tsc + build + dev verify → owner approval → merge/deploy/tag (standard workflow). Order = risk reduction per effort.

## Step 1 — Rotate exposed credentials (SEC-004) · TODAY · owner + agent
1. **Neon prod password** (owner approves; agent can run): Neon console → project `twilight-pine-29350562` → branch `production` → Roles → `neondb_owner` → Reset password.
2. Update Secret Manager: `gcloud secrets versions add DATABASE_URL --data-file=-` (new pooled URL) — redeploy picks `latest`.
3. Update local `.env.local` only if it points to prod (it points to dev — verify) and the GitHub Actions secret used by `nightly-backup.yml`.
4. Verify: prod login + `/stock` loads; next nightly backup run succeeds.
5. **Legacy montaservice password** — owner changes it in the legacy app.
6. **Gemini + Browserbase keys** — owner revokes at Google AI Studio / Browserbase.
7. Agent: replace literal creds in `erp-inventory/AGENTS.md:101` with `MONTA_USER=$MONTA_USER MONTA_PASS=$MONTA_PASS`; commit (docs).

## Step 2 — Fix PIN brute-force (SEC-003) · TODAY · branch `hotfix/pin-ip-lockout`
1. Log raw `x-forwarded-for` once on prod (temporary `logEvent`) to confirm Cloud Run's format; expected: real client IP is the **right-most** entry.
2. `src/lib/actions/auth.ts` `clientIp()`: take the right-most XFF entry instead of `[0]`.
3. Add progressive delay on failures (e.g. wait `min(2^n, 30)` s per IP) so the global cap is no longer the main defence.
4. Lower the global DoS impact: on global cap, keep login open for the **ADMIN_PIN** only after a short delay instead of a hard 15-min block (or document IAP as the real fix).
5. Owner sets a new `ADMIN_PIN` ≥ 8 digits: `gcloud secrets versions add ADMIN_PIN` + redeploy.
6. Verify on dev: 5 failures with rotating fake XFF headers → still locked.

## Step 3 — Next.js upgrade (SEC-001) · THIS WEEK · branch `feature/next-16-4-5`
1. Read `node_modules/next/dist/docs` upgrade notes for 16.4.x (per AGENTS.md rule).
2. `npm install next@16.4.5 eslint-config-next@16.4.5` + `npm audit fix` (dompurify).
3. `npm audit --omit=dev` → 0 critical.
4. tsc + build + IronBee smoke: login, POS sale, /ventes, /comptabilite, /stock.

## Step 4 — Security headers (SEC-005) · THIS WEEK · same branch or `feature/security-headers`
1. `next.config.ts`: `poweredByHeader: false`; add to `headers()`:
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`
   - `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy: camera=(self), microphone=()`
   - CSP start in `Content-Security-Policy-Report-Only` (R2 image host + self) → enforce after a week without violations.
2. Verify with `curl -sI` on dev and prod; check POS barcode camera + R2 images still load.

## Step 5 — PIN oracle (SEC-007) · THIS WEEK · branch `hotfix/pin-oracle`
1. `profile.ts` `changeMyPin` (and `users.ts` `saveUser` dup path): replace message with generic "PIN non autorisé, choisissez-en un autre".
2. Add per-user limit: max 5 `changeMyPin` failures / 15 min (count `audit_logs` rows `CHANGEMENT_PIN_ECHEC`, same pattern as login).
3. `revokeAllSessions` → `assertOwner()` (SEC-006 part).
4. Verify on dev with a caissier test user.

## Step 6 — Least-privilege identities + deploy control (OPS-001) · THIS WEEK · infra (owner approval per command)
1. Create `erp-runtime@erp-syste.iam.gserviceaccount.com`; grant `roles/secretmanager.secretAccessor` on the 6 secrets only (+ `logging.logWriter`).
2. Deploy with `--service-account erp-runtime@…`; verify login + R2 upload + email.
3. Decide trigger policy (owner):
   - **A:** keep trigger, add `includedFiles: erp-inventory/**` so docs commits don't deploy, and use a dedicated `erp-deployer` SA (run.admin + artifactregistry.writer + actAs runtime SA).
   - **B:** delete trigger, keep manual `gcloud run deploy`.
4. Remove `roles/editor` from the default compute SA once nothing depends on it.
5. Update `Github_Branching_instructions.md` §5 + AGENTS.md to match reality.

## Step 7 — Import bookkeeping (BIZ-002, BIZ-003) · THIS WEEK · owner decision + script
1. Check Nov 4 feuille de journée for the 15 213 DH espèces.
2. Owner chooses treatment for the 2 credit balances (e.g. reclassify method/date so they don't hit till cash).
3. Insert one `IMPORT_LEGACY` audit row (counts, totals 697 910,50, script commit `0049427`).

## Step 8 — Edge protection · THIS MONTH · infra
1. Preferred for single user: **IAP on Cloud Run** (Google-account allowlist) → removes public exposure; PIN becomes second factor.
2. Alternative: HTTPS LB + Cloud Armor (rate limit on POST, optional IP allowlist) + `ingress: internal-and-cloud-load-balancing`.
3. Add 12-h idle session timeout (re-sign cookie with sliding `exp`).

## Step 9 — Long-term
- CI gates: tsc + build + lint on PRs/pushes (GitHub Actions), pin actions by SHA, top-level `permissions: read-all`.
- Dependabot + GitHub secret scanning / push protection.
- Tests for stock movements, totals/TVA, document transitions, payment statuses.
- Confirm Neon plan PITR window; run restore drill twice a year.

## Progress log (added 2026-11-07)

- **Step 1 ✅ DONE** — Neon password rotated (live app + backup verified, v1 disabled); legacy cred removed from AGENTS.md (history left, repo private); Gemini/Browserbase confirmed never committed.
- **Step 2 ✅ DONE** — `v1.9.0`/`erp-system-00153-vlg`: right-most XFF clientIp (prod-verified real IP in audit), progressive delays (1→8s), 4–8-digit PIN UI (no auto-submit), ADMIN_PIN rotated to 8 digits. Brute force now ~decades vs ~3 days.
- **Step 3 ✅ DONE** — `v1.9.1`/`erp-system-00154-6hr`: next 16.4.5 + dompurify 3.4.17, `npm audit` = 0 vulnerabilities, live-verified.
- **Step 4 ✅ DONE** — `v1.9.2`/`erp-system-00155-sgk`: HSTS, XFO/CSP frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy, poweredByHeader off. CSP Report-Only (enforce after observing).
- **Step 5 ✅ DONE** — `v1.9.3`/`erp-system-00156-8nm`: changeMyPin generic error + 5-fail/15min limit, revokeAllSessions owner-only.
- **Step 6 ✅ DONE** — `erp-system-00157-w6n` runs as `erp-runtime` (secretAccessor on 6 secrets + logWriter). `erp-deployer` SA owns the Cloud Build trigger; trigger now restricted to `includedFiles: erp-inventory/**`. `roles/editor` removed from default compute SA.
- **Step 8 ✅ DONE** — IAP enabled on `erp-system` (europe-west1): custom OAuth client `1046319022554-oeirf7rhh6keb18ke7kk0cmoenanvk2q`, redirect URI configured, `iap.httpsResourceAccessor` bound to davidsmithny01@gmail.com at project level, IAP SA granted run.invoker. Unauthenticated requests → 302 to Google sign-in; app invisible to the public internet. Chain: Google sign-in → PIN pad. Note: erp-system's Security tab also shows a "Require authentication" option — IAM invoker check can be enabled as a second layer if desired.
- **Step 9 ✅ DONE** — CI gate `ci.yml`: tsc+eslint(errors)+build on push/PR for erp-inventory/** + workflow_dispatch; first real run green. Dependabot alerts ON + dependabot.yml (weekly npm). Root zod alert cleared; 2 moderate dev-only transitive alerts remain (typescript-estree/tsx, needs upstream major bump). Secret scanning unavailable without GHAS. Bonus: 4 set-state-in-effect errors fixed.
