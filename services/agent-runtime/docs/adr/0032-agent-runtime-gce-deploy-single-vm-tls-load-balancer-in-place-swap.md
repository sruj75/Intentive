# ADR 0032: Agent Runtime deploys to one GCE VM behind a TLS load balancer; deploys are in-place image swaps with a lightweight drain

## Status

Accepted — scopes the v1 production deploy of the Agent Runtime. Builds on ADR-0030 (off-the-shelf observability, Sentry as the error/health layer), ADR-0024 (cron poll loop), ADR-0016 (per-user channel), ADR-0011 (eternal conversation / stable `thread_id`). Pairs with ADR-0033 (internal endpoint on public ingress). The Control Plane's ADR-0007 is the stateless-on-Cloud-Run counterpart; this ADR is the opposite case.

## Context

The Agent Runtime is **always-alive and stateful**: one Node process holds live WebSocket connections, the in-memory Per-User Channels, the process-local connection registry, and the Cron + Heartbeat poll loops in RAM. It deploys to a single Google Compute Engine VM (Container-Optimized OS + konlet), not to a stateless platform. The deploy workflow (`agent-runtime-deploy.yml`) already builds an image, pushes to Artifact Registry, and swaps the running container with `gcloud compute instances update-container`.

That left a set of "the workflow runs, but is it actually serving users?" gaps that Cloud Run had handled for free on the Control Plane: TLS termination, a stable front door, secret delivery, what a deploy does to live work, what restarts a crash, and the database connection shape. This ADR records the v1 answers as one coherent deploy posture.

## Decision

**1. TLS via an External HTTPS Load Balancer.** The process serves plain `ws` on `:8080` (`main.ts`); a Google-managed-cert External HTTPS Load Balancer terminates `wss://` for `runtime.heyintentive.com` and forwards to the VM. The VM's `:8080` firewall accepts traffic **only from Google load-balancer ranges**. Because the WebSocket layer has **no app-level keepalive ping**, the LB backend timeout is set high (~1 day) so idle conversations are not cut. This is the standard GCP WebSocket pattern; it also supplies the one health check the backend structurally needs.

**2. Single VM, no horizontal scaling in v1 — deliberately.** This architecture cannot be scaled to 2+ VMs for reliability without an architecture change: the connection registry is process-local, and **both VMs would independently run the Cron and Heartbeat poll loops** (`selectDue` against Neon), double-firing every user's scheduled and proactive turns. Redundancy/HA is deferred and must first solve scheduler leader-election (or atomic job claiming). A future reader who wants to "just add instances" for reliability must read this first.

**3. Crash recovery is konlet + GCE auto-restart; detection is Sentry.** A crashed _container_ is restarted by konlet (`--container-restart-policy=always`); a failed _host_ is restarted by GCE's default automatic restart. Durable state lives in Neon, so the fresh process rehydrates and clients reconnect (snapshot-first, at-most-once live stream — ARCHITECTURE "Reliability"). A _hung-but-not-crashed_ process is **not** auto-healed in v1; we rely on **Sentry** (ADR-0030's error/health layer) to surface issues and fix reactively. No Cloud Monitoring uptime/alert pipeline, no MIG autohealing, no deep `/readyz` — those are evidence-driven later additions.

**4. Secrets come from Secret Manager, fetched at boot.** A short entrypoint in the image uses the VM's **dedicated** service account (scoped to `secretmanager.secretAccessor`, not the default Compute SA) to pull only the `SECRET_NAMES` allowlist from Secret Manager, then launches the runtime process and forwards stop signals. Secrets never sit in instance metadata. This is the same secret store the Control Plane uses — one secrets story across the system.

**5. Deploys are in-place image swaps with a lightweight drain.** There is no no-traffic revision on a single VM; the swap _is_ the promotion. On `SIGTERM` `main.ts` performs a **lightweight drain**: stop the Cron + Heartbeat schedulers (`stop()`), `wss.close()` and send connected clients a clean "going away" close so they reconnect immediately, flush Sentry + Langfuse via `observability.shutdown()` (in `packages/providers` — domain/main code must not call `@sentry/node` directly, per ADR-0030), then exit. The container stop-grace is set to ~30s so the close+flush completes. The drain deliberately **does not wait for in-flight turns** — LangGraph durable execution (per-step checkpoints) plus idempotent `message_id` ingress plus snapshot-first reconnect already make a mid-turn kill safe, and a turn's LLM calls would blow past any sane stop-grace anyway.

**6. Direct (non-pooled) Neon connection.** Unlike the Control Plane (pooled + Neon HTTP driver, chosen because Cloud Run autoscales), the Runtime is one always-alive process with a small bounded connection count and uses LangGraph's `PostgresStore` + `PostgresSaver`, which rely on persistent connections and prepared statements that break against Neon's PgBouncer transaction-pooling endpoint. `NEON_DATABASE_URL` therefore uses the **direct** (non-`-pooler`) host. Do not "fix" this by swapping in the pooled string.

**7. First deploy before users; ongoing deploys are graceful rolling reconnects; rollback is by SHA.** The careful first deploy is run manually (`workflow_dispatch`) **before real users exist**, so the connection-drop is free; it is smoke-tested with a real `wss://` connect-and-converse (TLS handshake → `connect`/snapshot → `user_message` → companion reply, exercising TLS + Neon + OpenRouter + the turn spine at once) plus a Control-Plane Session Start to `/internal`. Only then is `DEPLOY_ENABLED=true` set. Every later deploy is a brief all-users reconnect (made clean by the drain), not blue-green. Rollback = re-run `update-container` pinned to the previous `github.sha` image (prior tags remain in Artifact Registry).

## Considered Options

- **HTTPS Load Balancer + managed cert (chosen)** vs Caddy/nginx-on-VM (awkward second process on a single-container COS VM, self-managed certs) vs Cloudflare proxy (third party in the hot path; free-tier WS idle timeout would kill our ping-less connections).
- **Single VM, HA deferred (chosen)** vs a Managed Instance Group now (drags in leader-election to avoid double-fired schedulers; premature for v1's user count and the in-process-state design).
- **Lightweight drain (chosen)** vs full turn-draining (cannot finish multi-second LLM turns within stop-grace; durable execution makes it unnecessary) vs hard kill (loses the last telemetry and forces slow TCP-timeout reconnects).
- **Secret Manager at boot (chosen)** vs plaintext env in instance metadata (readable by any project Viewer; too broad for a DB URL + LLM key).
- **Direct Neon connection (chosen)** vs pooled (breaks LangGraph's persistent-connection/prepared-statement usage; no autoscaling here to justify pooling).

## Consequences

- `main.ts` gains a `SIGTERM`/`SIGINT` handler; `packages/providers` observability gains a `shutdown()` that flushes Sentry + Langfuse. The Dockerfile gains a Secret-Manager boot-fetch entrypoint.
- The LB health check for the WebSocket backend is a **TCP check on `:8080`** (a raw `ws` server cannot answer an HTTP `GET`); the internal backend can health-check `GET /health` on `:8081`. An app-level WebSocket ping is the clean long-term replacement for the high LB timeout.
- One VM is a single point of failure with a few-minutes reboot window; accepted for a pre-launch single-operator v1.
- Provisioning is owned out-of-band (ADR-0033 pairing, README "Deployment"): the `agent_runtime` schema, a walled-off `agent_runtime_app` role with `CREATE`, migrations `0001`–`0009`, and the boot-time creation of the LangGraph store + checkpoint tables.
- Re-introducing HA, autohealing, a metrics/alerting pipeline, or blue-green is a future, evidence-driven decision recorded as its own ADR.
