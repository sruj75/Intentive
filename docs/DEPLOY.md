# Deployables Production Handoff

This is the one-stop production context for agents operating the two server deployables:

- **Control Plane**: `services/control-plane/`, Cloud Run.
- **Agent Runtime**: `services/agent-runtime/`, one always-alive GCE VM behind a global HTTPS load balancer.

Use this with the owning deployable docs:

- [services/control-plane/README.md](../services/control-plane/README.md)
- [services/control-plane/ARCHITECTURE.md](../services/control-plane/ARCHITECTURE.md)
- [services/agent-runtime/README.md](../services/agent-runtime/README.md)
- [services/agent-runtime/ARCHITECTURE.md](../services/agent-runtime/ARCHITECTURE.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)

## Current Production State

Snapshot date: 2026-06-20.

### Shared

- GCP project: `agentic-accountability`
- Primary region: `us-west1`
- Artifact Registry repository: `us-west1-docker.pkg.dev/agentic-accountability/intentive`
- Deployed server SHA at first full production handoff: `637ffbb311bd62abe83da7e960041602f8cd7251`
- Neon project: `divine-frog-67020768`
- Neon production branch: `br-young-star-aqq42sg4`
- Neon production host family: `ep-lucky-dew-aqkjv8j5.c-8.us-east-1.aws.neon.tech`
- Neon Auth issuer/audience: `https://ep-lucky-dew-aqkjv8j5.neonauth.c-8.us-east-1.aws.neon.tech`
- Neon Auth JWKS: `https://ep-lucky-dew-aqkjv8j5.neonauth.c-8.us-east-1.aws.neon.tech/neondb/auth/.well-known/jwks.json`
- Runtime domain: `runtime.heyintentive.com`
- Runtime reserved global IP: `8.232.97.220`
- DNS owner: GoDaddy (`heyintentive.com` delegated to `ns55.domaincontrol.com` / `ns56.domaincontrol.com`)
- Required DNS record:

```text
runtime.heyintentive.com.  A  8.232.97.220
```

### Control Plane

- Service: Cloud Run `control-plane`
- Region: `us-west1`
- Public URL: `https://control-plane-pqenui44sa-uw.a.run.app`
- Also observed Cloud Run service URL: `https://control-plane-916801857675.us-west1.run.app`
- Live env:
  - `RUNTIME_INTERNAL_BASE_URL=https://runtime.heyintentive.com`
  - `NEON_DATABASE_ROLE=control_plane_app`
  - `SENTRY_ENVIRONMENT=production`
  - `SENTRY_MODE=errors-only`
- Secret Manager values mounted by Cloud Run:
  - `NEON_DATABASE_URL`
  - `INTERNAL_SECRET_TO_RUNTIME`
  - `INTERNAL_SECRET_FROM_RUNTIME`
  - `INTERNAL_SECRET_FOR_MAINTENANCE`
  - `SENTRY_DSN`
- Public health checks:
  - `GET /health`
  - `GET /ready`
- Auth boundary smoke:
  - `GET /me` without a token should return a structured `401`.

### Agent Runtime

- VM: `agent-runtime`
- Zone: `us-west1-a`
- VM external IP: none
- Runtime service account: `agent-runtime-runtime@agentic-accountability.iam.gserviceaccount.com`
- VM network tag: `agent-runtime`
- Current image: `us-west1-docker.pkg.dev/agentic-accountability/intentive/agent-runtime:637ffbb311bd62abe83da7e960041602f8cd7251`
- Public WSS URL: `wss://runtime.heyintentive.com/ws`
- Runtime Control Plane base URL: `https://control-plane-pqenui44sa-uw.a.run.app`
- Container boot secret fetcher: `services/agent-runtime/scripts/boot-fetch-secrets.mjs`
- Secret allowlist in VM metadata:

```text
NEON_DATABASE_URL=AGENT_RUNTIME_NEON_DATABASE_URL
INTERNAL_SECRET_FROM_CONTROL_PLANE=INTERNAL_SECRET_TO_RUNTIME
INTERNAL_SECRET_TO_CONTROL_PLANE=INTERNAL_SECRET_FROM_RUNTIME
OPENROUTER_API_KEY=AGENT_RUNTIME_OPENROUTER_API_KEY
SENTRY_DSN=AGENT_RUNTIME_SENTRY_DSN
LANGFUSE_PUBLIC_KEY=AGENT_RUNTIME_LANGFUSE_PUBLIC_KEY
LANGFUSE_SECRET_KEY=AGENT_RUNTIME_LANGFUSE_SECRET_KEY
```

Runtime Secret Manager values:

- `AGENT_RUNTIME_NEON_DATABASE_URL` - direct, non-pooled Neon URL for `agent_runtime_app`
- `AGENT_RUNTIME_OPENROUTER_API_KEY`
- `AGENT_RUNTIME_SENTRY_DSN`
- `AGENT_RUNTIME_LANGFUSE_PUBLIC_KEY`
- `AGENT_RUNTIME_LANGFUSE_SECRET_KEY`
- Directional shared secrets are reused with Control Plane:
  - `INTERNAL_SECRET_TO_RUNTIME`
  - `INTERNAL_SECRET_FROM_RUNTIME`

Load balancer inventory:

- Global forwarding rule: `agent-runtime-https-forwarding-rule`, TCP `443`, IP `8.232.97.220`
- Target HTTPS proxy: `agent-runtime-https-proxy`
- URL map: `agent-runtime-url-map`
- Active managed certificate: `agent-runtime-cert`
- Host rule: `runtime.heyintentive.com -> internal-paths`
- URL map routes:
  - `/internal/*` -> `agent-runtime-internal-backend`
  - default -> `agent-runtime-ws-backend`
- Backends:
  - `agent-runtime-ws-backend` -> instance group `agent-runtime-ig`, named port `runtime-ws:8080`
  - `agent-runtime-internal-backend` -> instance group `agent-runtime-ig`, named port `runtime-internal:8081`
- Health checks:
  - `agent-runtime-ws-tcp-hc`: TCP `8080`
  - `agent-runtime-internal-http-hc`: currently HTTP `8081` path `/healthz` in production infrastructure

Important health route note:

- Current repo code after the health cleanup commits makes Agent Runtime internal liveness `GET /health`.
- The production GCP health check was observed as `/healthz` on 2026-06-20.
- Before deploying an Agent Runtime image that removes `/healthz`, update `agent-runtime-internal-http-hc` to `/health`, or keep a temporary alias until the health check has been migrated.

## GitHub Actions Wiring

Deploy workflows are gated by repository variable `DEPLOY_ENABLED == "true"` for push deploys. `workflow_dispatch` always runs when manually triggered.

### Repository Variables

Expected values:

```text
AGENT_RUNTIME_PUBLIC_WS_URL=wss://runtime.heyintentive.com/ws
AGENT_RUNTIME_SECRET_NAMES=NEON_DATABASE_URL=AGENT_RUNTIME_NEON_DATABASE_URL INTERNAL_SECRET_FROM_CONTROL_PLANE=INTERNAL_SECRET_TO_RUNTIME INTERNAL_SECRET_TO_CONTROL_PLANE=INTERNAL_SECRET_FROM_RUNTIME OPENROUTER_API_KEY=AGENT_RUNTIME_OPENROUTER_API_KEY SENTRY_DSN=AGENT_RUNTIME_SENTRY_DSN LANGFUSE_PUBLIC_KEY=AGENT_RUNTIME_LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY=AGENT_RUNTIME_LANGFUSE_SECRET_KEY
CONTROL_PLANE_INTERNAL_BASE_URL=https://control-plane-pqenui44sa-uw.a.run.app
RUNTIME_INTERNAL_BASE_URL=https://runtime.heyintentive.com
NEON_AUTH_JWKS_URL=https://ep-lucky-dew-aqkjv8j5.neonauth.c-8.us-east-1.aws.neon.tech/neondb/auth/.well-known/jwks.json
NEON_AUTH_ISSUER=https://ep-lucky-dew-aqkjv8j5.neonauth.c-8.us-east-1.aws.neon.tech
NEON_AUTH_AUDIENCE=https://ep-lucky-dew-aqkjv8j5.neonauth.c-8.us-east-1.aws.neon.tech
NEON_DATABASE_ROLE=control_plane_app
```

Check them with:

```bash
gh variable list --repo sruj75/Intentive | rg 'DEPLOY_ENABLED|AGENT_RUNTIME|CONTROL_PLANE_INTERNAL_BASE_URL|RUNTIME_INTERNAL_BASE_URL|NEON_AUTH|NEON_DATABASE_ROLE'
```

### Repository Secrets

Required GitHub secrets:

- `GCP_PROJECT_ID`
- `GCP_SA_KEY` - Control Plane deploy service account JSON
- `AGENT_RUNTIME_GCP_SA_KEY` - Agent Runtime deploy service account JSON

Do not print secret values into logs, docs, PR bodies, or final handoffs.

## First Deploy And Bootstrap Notes

### Control Plane First Deploy

Control Plane deploys safely through Cloud Run revision promotion:

1. Confirm production Neon schema and role exist:
   - schema `control_plane`
   - role `control_plane_app`
   - migrations applied
   - no cross-schema privilege into `agent_runtime`
2. Confirm Secret Manager values exist:
   - `NEON_DATABASE_URL`
   - `INTERNAL_SECRET_TO_RUNTIME`
   - `INTERNAL_SECRET_FROM_RUNTIME`
   - `INTERNAL_SECRET_FOR_MAINTENANCE`
   - `SENTRY_DSN`
3. Run `control-plane-deploy` manually from GitHub Actions.
4. The workflow deploys a no-traffic candidate revision.
5. Candidate smoke must pass:
   - `GET /health` -> `200`
   - `GET /ready` -> `200`
   - `GET /me` without token -> structured `401`
6. Only then promote candidate traffic to 100%.
7. Once manual production deploy is proven, set `DEPLOY_ENABLED=true` for push deploys.

### Agent Runtime First Deploy

Agent Runtime is an in-place VM image swap, not a no-traffic Cloud Run revision. Treat the first deploy as a pre-user operation.

1. Confirm DNS first:

```bash
dig runtime.heyintentive.com A +short
```

Expected:

```text
8.232.97.220
```

2. Confirm the Google-managed cert is active:

```bash
gcloud compute ssl-certificates describe agent-runtime-cert \
  --global \
  --project agentic-accountability \
  --format='yaml(managed.status,managed.domainStatus)'
```

Expected:

```text
managed:
  domainStatus:
    runtime.heyintentive.com: ACTIVE
  status: ACTIVE
```

3. Confirm production Neon schema and role:
   - schema `agent_runtime`
   - role `agent_runtime_app`
   - direct, non-pooled connection string
   - `agent_runtime_app` has `CREATE` on database `neondb`
   - `agent_runtime_app` has `USAGE, CREATE` on schema `agent_runtime`
   - `agent_runtime_app` has no `USAGE` on schema `control_plane`

The database-level `CREATE` grant is required because LangGraph `PostgresStore.setup()` runs `CREATE SCHEMA IF NOT EXISTS "agent_runtime"` before its table migrations.

4. Confirm Secret Manager values exist and have no trailing newline for bearer-token secrets:

```bash
for s in INTERNAL_SECRET_TO_RUNTIME INTERNAL_SECRET_FROM_RUNTIME; do
  bytes=$(gcloud secrets versions access latest --secret="$s" --project agentic-accountability | wc -c | tr -d ' ')
  last_byte=$(gcloud secrets versions access latest --secret="$s" --project agentic-accountability | tail -c 1 | od -An -t u1 | tr -d ' ')
  echo "$s bytes=$bytes last_byte=$last_byte"
done
```

`last_byte` must not be `10`. A newline caused `401 auth_failed` during first bootstrap because HTTP bearer tokens cannot carry the newline the service loaded from Secret Manager.

5. Run `agent-runtime-deploy` manually from GitHub Actions.
6. Confirm the VM uses the expected image tag:

```bash
gcloud compute instances describe agent-runtime \
  --zone us-west1-a \
  --project agentic-accountability \
  --format='yaml(status,metadata.items)'
```

7. Confirm the container starts:

```bash
gcloud compute ssh agent-runtime \
  --zone us-west1-a \
  --project agentic-accountability \
  --tunnel-through-iap \
  --command 'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"; c=$(docker ps -a --filter name=klt-agent-runtime --format "{{.ID}}" | head -1); if [ -n "$c" ]; then docker logs --tail=120 "$c"; fi'
```

Good logs include:

```text
Loaded 7 runtime secrets from Secret Manager
runtime.public_ws_listening
runtime.internal_api_listening
cron.tick
heartbeat.tick
```

8. Confirm load balancer health:

```bash
gcloud compute backend-services get-health agent-runtime-ws-backend \
  --global \
  --project agentic-accountability \
  --format='yaml(status)'

gcloud compute backend-services get-health agent-runtime-internal-backend \
  --global \
  --project agentic-accountability \
  --format='yaml(status)'
```

Both must be `HEALTHY`.

9. Smoke Session Start over the real public HTTPS load balancer. Use a UUID-shaped user id.

   > **This smoke writes durable production state — you MUST tear it down (step 9, teardown below).** `/internal/sessions/start` upserts a row into `agent_runtime.agent_instances`, and the always-alive heartbeat scheduler drives **every** row in that table as a live user, firing Monitoring Turns and LLM calls on each heartbeat — forever. Leftover smoke rows were the root cause of Sentry `AGENT-RUNTIME-2`/`-4` (GitHub #115/#116): the runtime called the model on a ~5-minute heartbeat for phantom smoke users no human ever created.

```bash
secret_file=$(mktemp)
body_file=$(mktemp)
response_file=$(mktemp)
trap 'rm -f "$secret_file" "$body_file" "$response_file"' EXIT

gcloud secrets versions access latest \
  --secret=INTERNAL_SECRET_TO_RUNTIME \
  --project agentic-accountability > "$secret_file"

cat > "$body_file" <<'JSON'
{"user_id":"00000000-0000-4000-8000-0000000000ff","auth_subject":"smoke-session-start"}
JSON

curl -sS -o "$response_file" -w '%{http_code}\n' \
  -X POST 'https://runtime.heyintentive.com/internal/sessions/start' \
  -H "authorization: Bearer $(cat "$secret_file")" \
  -H 'content-type: application/json' \
  --data-binary "@$body_file" \
  --connect-timeout 8 \
  --max-time 20

cat "$response_file"
```

Expected status: `200`

Expected response shape:

```json
{
  "agent_instance_id": "<string>",
  "ws_url": "wss://runtime.heyintentive.com/ws"
}
```

**Teardown (required — run even if the smoke fails).** Delete the instance this smoke just created, so the heartbeat scheduler does not keep waking it as a live user. Run against the agent-runtime Neon database (project **Intentive**, schema `agent_runtime`) via the Neon SQL editor or any psql client:

```sql
DELETE FROM agent_runtime.agent_instances WHERE auth_subject LIKE 'smoke-%';
```

Confirm no smoke rows survive (expect `0`):

```sql
SELECT count(*) FROM agent_runtime.agent_instances WHERE auth_subject LIKE 'smoke-%';
```

Until real users exist, `agent_instances` should be **empty** between deploys — any row there is a live heartbeat target.

If this Mac has stale DNS cache, add:

```bash
--resolve runtime.heyintentive.com:443:8.232.97.220
```

to the `curl` command. During first bootstrap, macOS briefly cached `runtime.heyintentive.com` as `0.0.0.0` / `::` from before the domain existed, while public DNS and the load balancer were already correct.

10. Confirm the WebSocket front door responds as a WebSocket endpoint:

```bash
curl -sS -I https://runtime.heyintentive.com --connect-timeout 8 --max-time 12
```

Expected status: `426 Upgrade Required`.

11. Once a manual production deploy is proven, set `DEPLOY_ENABLED=true` for push deploys.

## Full Production Smoke

Run these after any server deploy.

### Control Plane

```bash
curl -sS -i https://control-plane-pqenui44sa-uw.a.run.app/health | sed -n '1,14p'
curl -sS -i https://control-plane-pqenui44sa-uw.a.run.app/ready | sed -n '1,18p'
curl -sS -i https://control-plane-pqenui44sa-uw.a.run.app/me | sed -n '1,24p'
```

Expected:

- `/health` -> `200`
- `/ready` -> `200` with `{"ready":true,"checks":{"neon":"ok","jwks":"ok"}}`
- `/me` without token -> structured `401`

### Agent Runtime

```bash
dig runtime.heyintentive.com A +short

gcloud compute ssl-certificates describe agent-runtime-cert \
  --global \
  --project agentic-accountability \
  --format='yaml(managed.status,managed.domainStatus)'

gcloud compute backend-services get-health agent-runtime-ws-backend \
  --global \
  --project agentic-accountability \
  --format='yaml(status)'

gcloud compute backend-services get-health agent-runtime-internal-backend \
  --global \
  --project agentic-accountability \
  --format='yaml(status)'
```

Expected:

- DNS -> `8.232.97.220`
- cert -> `ACTIVE`
- both backends -> `HEALTHY`

Then run the Session Start smoke from the first-deploy procedure.

## Rollback

### Control Plane

Cloud Run rollback is revision-based:

```bash
gcloud run revisions list \
  --service control-plane \
  --region us-west1 \
  --project agentic-accountability

gcloud run services update-traffic control-plane \
  --region us-west1 \
  --project agentic-accountability \
  --to-revisions <LAST_GOOD_REVISION>=100
```

After rollback, run:

```bash
curl -sS https://control-plane-pqenui44sa-uw.a.run.app/ready
```

### Agent Runtime

Agent Runtime rollback is an image-tag swap on the VM. Artifact Registry keeps SHA tags.

```bash
LAST_GOOD_SHA=<sha>
IMAGE="us-west1-docker.pkg.dev/agentic-accountability/intentive/agent-runtime:${LAST_GOOD_SHA}"

env_file=$(mktemp)
cat > "$env_file" <<'EOF'
GOOGLE_CLOUD_PROJECT=agentic-accountability
SECRET_NAMES=NEON_DATABASE_URL=AGENT_RUNTIME_NEON_DATABASE_URL INTERNAL_SECRET_FROM_CONTROL_PLANE=INTERNAL_SECRET_TO_RUNTIME INTERNAL_SECRET_TO_CONTROL_PLANE=INTERNAL_SECRET_FROM_RUNTIME OPENROUTER_API_KEY=AGENT_RUNTIME_OPENROUTER_API_KEY SENTRY_DSN=AGENT_RUNTIME_SENTRY_DSN LANGFUSE_PUBLIC_KEY=AGENT_RUNTIME_LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY=AGENT_RUNTIME_LANGFUSE_SECRET_KEY
PUBLIC_WS_URL=wss://runtime.heyintentive.com/ws
CONTROL_PLANE_INTERNAL_BASE_URL=https://control-plane-pqenui44sa-uw.a.run.app
NEON_AUTH_JWKS_URL=https://ep-lucky-dew-aqkjv8j5.neonauth.c-8.us-east-1.aws.neon.tech/neondb/auth/.well-known/jwks.json
NEON_AUTH_ISSUER=https://ep-lucky-dew-aqkjv8j5.neonauth.c-8.us-east-1.aws.neon.tech
NEON_AUTH_AUDIENCE=https://ep-lucky-dew-aqkjv8j5.neonauth.c-8.us-east-1.aws.neon.tech
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=agent-runtime@<sha>
EOF

gcloud compute instances update-container agent-runtime \
  --zone us-west1-a \
  --project agentic-accountability \
  --container-image "$IMAGE" \
  --container-restart-policy always \
  --container-env-file "$env_file"

rm -f "$env_file"
```

Then run the Agent Runtime smoke checks.

## Known Bootstrap Traps

- **There is no Google-provided dummy hostname for this load balancer.** Cloud Run has `*.run.app`; a GCE VM behind a global HTTPS load balancer does not. During bootstrap, `runtime.8-232-97-220.sslip.io` was used only as a temporary smoke-test hostname while `heyintentive.com` was being purchased and DNS/cert validation settled. Do not leave production on `sslip.io`.
- **Do not use a CNAME for `runtime.heyintentive.com`.** Use the A record to `8.232.97.220`.
- **Do not expose VM port `8080` or `8081` directly.** The VM has no external IP. Access is through the global HTTPS load balancer and IAP SSH for diagnostics.
- **Directional secrets must be newline-free.** A trailing newline in `INTERNAL_SECRET_TO_RUNTIME` or `INTERNAL_SECRET_FROM_RUNTIME` causes bearer-token auth failures.
- **Agent Runtime uses a direct Neon URL.** Do not replace it with the pooled `-pooler` URL; LangGraph persistent connections/prepared statements are not compatible with transaction pooling.
- **Control Plane uses the pooled Neon URL.** It is stateless Cloud Run and should not use the runtime direct URL.
- **Session Start smoke user ids must be UUID strings.** The `agent_runtime.agent_instances.user_id` column is UUID typed.
- **Control Plane is not in the WebSocket data path.** It issues Routing and calls Runtime Session Start only.
- **Runtime root HTTPS returning `426` is good.** It means the request reached the WebSocket backend without an upgrade.
- **Health route drift matters.** Keep the GCP internal backend health-check path aligned with the deployed Agent Runtime image before enabling push deploys.

## One-Line Status For Future Agents

As of 2026-06-20, Control Plane is live on Cloud Run in `us-west1`, Agent Runtime is live on GCE VM `agent-runtime` in `us-west1-a`, `runtime.heyintentive.com` resolves to `8.232.97.220` with an active Google-managed certificate, Session Start over `https://runtime.heyintentive.com/internal/sessions/start` returns `wss://runtime.heyintentive.com/ws`, and both runtime load-balancer backends are healthy.
