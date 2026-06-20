# Agent Runtime Release Runbook

How an Agent Runtime build goes from merged `main` to live on the single
always-alive GCE VM **without declaring success until the new container actually
serves healthy traffic**. The release is identified by the merged commit SHA —
there is no semver tag for this deployable (`package.json` stays `0.0.0`). The
image tag and the Sentry release are both `github.sha`.

Production facts (project, zone, VM, load balancer inventory, DNS, secret/variable
inventory) live in the one-stop [`../../../docs/DEPLOY.md`](../../../docs/DEPLOY.md).
This runbook is the _release procedure_; DEPLOY.md is the _production state_. Keep
values there, not duplicated here.

---

## The release shape

Agent Runtime is **not** Cloud Run. It is one stateful VM behind a global HTTPS
load balancer, so it cannot do a Cloud Run-style no-traffic candidate revision,
and it cannot run blue-green: the runtime is a singleton (long-running state,
Cron, heartbeat) and running two containers at once would double every Cron and
heartbeat tick. The deploy is therefore an **in-place container swap**.

"Careful, preview-then-traffic" is still enforced — by the **load balancer**, not
by a parallel revision:

1. A PR lands on `main` (or you trigger the workflow manually).
2. `.github/workflows/agent-runtime-deploy.yml` runs: typecheck → test → build
   the SHA-tagged image → push to Artifact Registry.
3. `gcloud compute instances update-container` swaps the VM's container to the new
   image tag. Konlet pulls and restarts it.
4. While the new container is starting, its health endpoint is failing, so the
   load balancer **holds public traffic off it** — traffic only flows once the
   backend health check passes. This is the no-traffic-until-healthy guarantee.
5. The `Wait for runtime to serve through the load balancer` step polls the public
   front door (expecting `426 Upgrade Required`) for up to ~5 minutes. The job
   goes **green only once the swap has fully converged** and the WebSocket backend
   is serving again. A 426 through the load balancer means the request reached a
   HEALTHY ws backend without an upgrade.
6. If it never converges, the job fails **red** and you roll the image tag back
   (see Rollback). The swap is in place, so unlike Control Plane there is no
   untouched previous revision — rollback is an explicit re-swap.

The asymmetry vs [Control Plane's runbook](../../control-plane/docs/RELEASE.md) is
intentional and structural: Cloud Run previews a separate revision before any
traffic; the single stateful VM swaps in place and relies on the load-balancer
health check plus this convergence gate.

---

## One-time setup

Credentials and config are set once and live in GitHub, not the repo. See
[`../../../docs/DEPLOY.md` § GitHub Actions Wiring](../../../docs/DEPLOY.md#github-actions-wiring)
for the authoritative list. In summary:

- **Secrets**: `GCP_PROJECT_ID`, `AGENT_RUNTIME_GCP_SA_KEY` (Artifact Registry
  Writer + Compute Instance Admin (v1) + Service Account User).
- **Variables**: `AGENT_RUNTIME_PUBLIC_WS_URL`, `CONTROL_PLANE_INTERNAL_BASE_URL`,
  `NEON_AUTH_JWKS_URL`, `NEON_AUTH_ISSUER`, `NEON_AUTH_AUDIENCE`,
  `AGENT_RUNTIME_SECRET_NAMES`, and `DEPLOY_ENABLED`.
- **GCP, one-time**: Artifact Registry repo, the `agent-runtime` VM on
  Container-Optimized OS, the global HTTPS load balancer (forwarding rule, proxy,
  URL map, managed cert, backends, health checks), DNS `A` record, and the
  Runtime Secret Manager values. Full inventory in DEPLOY.md.

Push deploys stay **off** until `DEPLOY_ENABLED=true`. Until then, releases are
manual (`workflow_dispatch`), which always runs regardless of `DEPLOY_ENABLED`.
Prove the manual production deploy first; only then flip `DEPLOY_ENABLED`.

---

## Before deploying

Do this from a clean branch and merge through PR. Treat the first deploy as a
pre-user operation per [`../../../docs/DEPLOY.md` § Agent Runtime First Deploy](../../../docs/DEPLOY.md#agent-runtime-first-deploy).

1. Confirm DNS, the managed cert, and both backends are healthy (DEPLOY.md smoke).
2. Confirm the production Neon schema/role/grants and the direct (non-pooled)
   connection string.
3. **Directional secrets must be newline-free.** A trailing newline in
   `INTERNAL_SECRET_TO_RUNTIME` / `INTERNAL_SECRET_FROM_RUNTIME` causes
   `401 auth_failed`. Verify with the byte-count check in DEPLOY.md.
4. **Health route drift.** Confirm the GCP internal backend health-check path
   matches the deployed image's internal liveness route before enabling push
   deploys (DEPLOY.md flags `/healthz` vs `/health`).
5. Update [`CHANGELOG.md`](../CHANGELOG.md) if release behavior changed.
6. Merge the PR to `main` and confirm the commit on `origin/main`:

   ```bash
   git fetch origin main
   git rev-parse origin/main
   ```

---

## Deploy and watch

If `DEPLOY_ENABLED=true`, the merge to `main` deploys automatically. To deploy a
specific commit deliberately, trigger the workflow manually:

```bash
gh workflow run agent-runtime-deploy.yml --repo sruj75/Intentive --ref main
```

Watch the run:

```bash
gh run list --repo sruj75/Intentive --workflow agent-runtime-deploy.yml --limit 3
gh run view <run-id> --repo sruj75/Intentive --json status,conclusion,url,jobs
```

The run must end with `conclusion: success`. The load-bearing steps are:

- `Update VM to new image tag` — the in-place container swap
- `Wait for runtime to serve through the load balancer` — the convergence gate
  that holds the job red until the new container serves a healthy `426`

A red convergence gate means the new container did not come up healthy. Inspect
the container before deciding fix-forward vs rollback:

```bash
gcloud compute ssh agent-runtime \
  --zone us-west1-a --project agentic-accountability --tunnel-through-iap \
  --command 'c=$(docker ps -a --filter name=klt-agent-runtime --format "{{.ID}}" | head -1); docker logs --tail=120 "$c"'
```

Good logs include `Loaded N runtime secrets`, `runtime.public_ws_listening`,
`runtime.internal_api_listening`, `cron.tick`, `heartbeat.tick`.

---

## Verify the live release

After a green run, run the full Agent Runtime smoke from DEPLOY.md:

```bash
dig runtime.heyintentive.com A +short        # → 8.232.97.220

gcloud compute backend-services get-health agent-runtime-ws-backend \
  --global --project agentic-accountability --format='yaml(status)'
gcloud compute backend-services get-health agent-runtime-internal-backend \
  --global --project agentic-accountability --format='yaml(status)'
```

Both backends must be `HEALTHY`. Then run the **Session Start smoke** over the
real public HTTPS load balancer (the authenticated end-to-end check that CI can't
run without the bearer secret) — the full script is in
[`../../../docs/DEPLOY.md` § Agent Runtime First Deploy](../../../docs/DEPLOY.md#agent-runtime-first-deploy),
step 9. It must return `200` with:

```json
{ "agent_instance_id": "<string>", "ws_url": "wss://runtime.heyintentive.com/ws" }
```

Confirm the VM is on the SHA you shipped:

```bash
gcloud compute instances describe agent-runtime \
  --zone us-west1-a --project agentic-accountability \
  --format='value(metadata.items)' | tr ',' '\n' | grep -i image
```

---

## Rollback

Rollback is an image-tag re-swap — Artifact Registry keeps SHA tags. Use the full
`update-container` invocation with the env file from
[`../../../docs/DEPLOY.md` § Rollback](../../../docs/DEPLOY.md#rollback):

```bash
LAST_GOOD_SHA=<sha>
IMAGE="us-west1-docker.pkg.dev/agentic-accountability/intentive/agent-runtime:${LAST_GOOD_SHA}"
# build the env file exactly as in DEPLOY.md, then:
gcloud compute instances update-container agent-runtime \
  --zone us-west1-a --project agentic-accountability \
  --container-image "$IMAGE" \
  --container-restart-policy always \
  --container-env-file "$env_file"
```

Then re-run the verify smoke. The rollback is itself an in-place swap, so the same
load-balancer convergence applies — wait for the front door to return `426` and
both backends to report `HEALTHY` before calling it recovered.

---

## Ship gate

Agent Runtime is "shipped" once the convergence gate is green, both load-balancer
backends are `HEALTHY`, and the Session Start smoke returns the expected
`ws_url`. There is no separate distribution step — nothing is downloaded; the VM
simply serves the new container. The runtime is the always-alive Companion; treat
a red convergence gate as a live incident, not a build failure.
