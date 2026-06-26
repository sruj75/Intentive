# Control Plane Release Runbook

How a Control Plane build goes from merged `main` to live traffic on Cloud Run
**without ever serving an unverified revision**. The release is identified by the
merged commit SHA — there is no semver tag for this deployable (`package.json`
stays `0.0.0`). The image tag, the Cloud Run candidate, and the Sentry release
are all `github.sha`.

Production facts (project, region, URLs, secret/variable inventory) live in the
one-stop [`../../../docs/PRODUCTION.md`](../../../docs/PRODUCTION.md). This runbook is the
_release procedure_; PRODUCTION.md is the _production state_. Keep values there, not
duplicated here.

---

## The release shape

There is one Control Plane release path, and it is careful by construction. A new
revision **never takes traffic until it has passed its smoke**:

1. A PR lands on `main` (or you trigger the workflow manually).
2. `.github/workflows/control-plane-deploy.yml` runs: typecheck → test → build
   the SHA-tagged image → push to Artifact Registry.
3. The image deploys to Cloud Run as a **no-traffic candidate revision**
   (`--no-traffic --tag candidate-<run>`). 0% of users reach it.
4. The candidate is smoked over its own tagged URL:
   - `GET /health` → `200`
   - `GET /ready` → `200`
   - `GET /me` without a token → structured `401` (`code: "auth_failed"`)
5. **Only if the smoke passes** does the workflow promote the candidate to 100%
   traffic. A failing smoke leaves production on the previous revision untouched.

This is the "preview, then traffic" model: Cloud Run's tagged no-traffic revision
is the preview, and promotion is the single moment traffic flows.

---

## One-time setup

Credentials and project config are set once and live in GitHub, not the repo.
See [`../../../docs/PRODUCTION.md` § GitHub Actions Wiring](../../../docs/PRODUCTION.md#github-actions-wiring)
for the authoritative list. In summary:

- **Secrets** (repo → Settings → Secrets and variables → Actions → Secrets):
  `GCP_PROJECT_ID`, `GCP_SA_KEY` (Artifact Registry Writer + Cloud Run Admin +
  Service Account User).
- **Variables**: `NEON_DATABASE_ROLE`, `NEON_AUTH_JWKS_URL`, `NEON_AUTH_ISSUER`,
  `NEON_AUTH_AUDIENCE`, `RUNTIME_INTERNAL_BASE_URL`, and `DEPLOY_ENABLED`.
- **GCP, one-time**: Artifact Registry repo, the `control-plane` Cloud Run
  service, and the Secret Manager values (`NEON_DATABASE_URL`,
  `INTERNAL_SECRET_TO_RUNTIME`, `INTERNAL_SECRET_FROM_RUNTIME`,
  `INTERNAL_SECRET_FOR_MAINTENANCE`, `SENTRY_DSN`).

Push deploys stay **off** until `DEPLOY_ENABLED=true`. Until then, releases are
manual (`workflow_dispatch`), which always runs regardless of `DEPLOY_ENABLED`.
Prove the manual production deploy first; only then flip `DEPLOY_ENABLED`.

---

## Before deploying

Do this from a clean branch and merge through PR. Do not deploy an unreviewed
local commit.

1. If the schema changed, confirm the production Neon schema/role/migrations are
   in place per [`../../../docs/PRODUCTION.md` § Control Plane First Deploy](../../../docs/PRODUCTION.md#control-plane-first-deploy).
2. Confirm the Secret Manager values exist (same section).
3. Update [`CHANGELOG.md`](../CHANGELOG.md) if release behavior changed.
4. Merge the PR to `main`.
5. Confirm the commit you intend to ship is on `origin/main`:

   ```bash
   git fetch origin main
   git rev-parse origin/main
   ```

---

## Deploy and watch

If `DEPLOY_ENABLED=true`, the merge to `main` deploys automatically. To deploy a
specific commit deliberately, trigger the workflow manually:

```bash
gh workflow run control-plane-deploy.yml --repo sruj75/Intentive --ref main
```

Watch the run:

```bash
gh run list --repo sruj75/Intentive --workflow control-plane-deploy.yml --limit 3
gh run view <run-id> --repo sruj75/Intentive --json status,conclusion,url,jobs
```

The run must end with `conclusion: success`. The load-bearing steps are:

- `Deploy to Cloud Run` — candidate revision, `--no-traffic`
- `Smoke candidate revision` — `/health`, `/ready`, `/me` against the tagged URL
- `Promote candidate traffic` — the only step that moves users onto the new code

If the **smoke** step fails, the candidate revision exists but carries no traffic;
production is unchanged. Fix forward in a PR and re-run — there is nothing to roll
back.

---

## Verify the live release

After promotion, smoke the public service (same checks as PRODUCTION.md):

```bash
curl -sS -i https://control-plane-pqenui44sa-uw.a.run.app/health | sed -n '1,14p'
curl -sS -i https://control-plane-pqenui44sa-uw.a.run.app/ready  | sed -n '1,18p'
curl -sS -i https://control-plane-pqenui44sa-uw.a.run.app/me     | sed -n '1,24p'
```

Pass:

- `/health` → `200`
- `/ready` → `200` with `{"ready":true,"checks":{"neon":"ok","jwks":"ok"}}`
- `/me` without a token → structured `401`

Confirm the serving revision is the SHA you shipped:

```bash
gcloud run services describe control-plane \
  --region us-west1 \
  --project agentic-accountability \
  --format='value(status.traffic[].revisionName,status.traffic[].percent)'
```

---

## Rollback

Cloud Run rollback is revision-based and instant — no rebuild:

```bash
gcloud run revisions list \
  --service control-plane --region us-west1 --project agentic-accountability

gcloud run services update-traffic control-plane \
  --region us-west1 --project agentic-accountability \
  --to-revisions <LAST_GOOD_REVISION>=100
```

Then re-run the verify smoke. Because promotion is the only step that touches
traffic, a bad release is at most one `update-traffic` away from reverted.

---

## Ship gate

Control Plane is "shipped" the moment the candidate is promoted to 100% **and**
the live smoke is green. There is no separate distribution step — unlike the
Desktop Client, nothing is downloaded. The Control Plane issues Routing and calls
Runtime Session Start; it is never in the WebSocket data path.
