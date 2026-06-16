# ADR 0025: User Timezone Is Device-Reported and Persisted Per-User

## Status

Accepted

## Date

2026-06-15

## Context

Cron (#39, ADR-0024) lets the Companion schedule wall-clock alarms: "ping at **9am**,"
"pill at **9pm**." A wall-clock time is meaningless without a timezone — "9pm" must
resolve to an actual instant to compute `next_fire_at`. So Cron forces a question the
runtime has never had to answer: **whose clock, and where does it come from?**

Bedrock facts:

- **The process has no meaningful timezone.** The Agent Runtime is one multi-tenant
  GCE process serving every user; its host timezone (likely UTC) is an accident of
  deployment, not the user's wall clock. "Server time" is wrong for every user not in
  the server's zone.
- **The LLM cannot be the source.** An agent-remembered timezone is guessed, stale, and
  unverifiable — exactly the kind of fact the shell should supply, not the brain.
- **Cron fires for offline users.** The scheduler can fire a user's Cron even with no live
  connection (the gym/driving case, ADR-0018). So the timezone must be **durable**, not
  read off a live socket at fire time — it has to be known when the user is absent.
- **The device already knows.** Every client (Mobile, Desktop) runs in the user's OS
  timezone and can report it on connect. The device is the one component that
  authoritatively knows where the user is right now.

## Decision

**The device is the source of truth for the user's timezone. The client reports its
IANA timezone as `client_tz` on every `connect`; the runtime persists it as durable
per-user state and resolves a job's wall-clock schedule against the user's _current_
timezone at fire time.**

1. **Reported on `connect` (contract-first).** `client_tz` (IANA, e.g.
   `America/New_York`) is added to the `connect` schema in `packages/protocol/` and
   parsed at the boundary. The handshake is the natural, repeated moment to refresh it.

2. **Persisted per-user, durably.** The runtime stores the latest reported zone as
   per-user state (alongside the Agent Instance row), so it is available when the user
   is offline and Cron must still fire correctly.

3. **Resolved at fire time, not at create time.** Recurring jobs compute `next_fire_at`
   against the user's _current_ persisted zone each cycle — so "9pm every day" follows
   the user across travel ("9pm wherever you are now"), rather than freezing the zone
   the job was created in.

4. **Per-job override (`tz`).** A cron card may carry an explicit `tz` (OpenClaw's
   `--tz`) for the rarer "9am New York time regardless of where I am" intent; absent
   that, the user's current zone wins.

5. **Last report wins; UTC is the last resort.** With multiple devices, the most recent
   `connect` report is authoritative (simple, and the user is one human in one place).
   UTC is used **only** when no device has ever reported a zone.

## Considered Options

- **Server/host timezone.** Rejected: meaningless in a multi-tenant process; wrong for
  everyone outside the host's zone.
- **Agent-remembered timezone (LLM writes it to memory).** Rejected: the brain guessing
  an unverifiable fact the senses can supply; stale and error-prone. The device reports
  it; the LLM does not.
- **Ask the user once and freeze it.** Rejected: breaks on travel and on the common case
  where the user never volunteers it; the device already knows and re-reports for free.
- **Read the live socket's zone at fire time.** Rejected: Cron fires for _offline_ users,
  who have no live socket — the whole reason the zone must be durable.

## Consequences

### Positive

- Wall-clock crons are correct for offline users — the offline-fire case works.
- Travel-correct by default; no manual zone management by the user.
- The shell supplies a verifiable fact; the brain is not asked to guess.
- One small, parse-at-boundary protocol addition; no new subsystem.

### Negative

- A zone change is only observed on the next `connect` — a job firing during travel,
  before any reconnection, uses the last-known zone (bounded, self-correcting staleness).
- Multi-device "last write wins" can briefly flap if two devices in different zones
  reconnect in sequence; acceptable for a single human and avoids reconciliation
  machinery.

### Neutral / Follow-up

- Whether to also capture a UTC offset / DST snapshot for audit, and how aggressively to
  refresh mid-session, are tuning details, not fixed here. croner handles DST from the
  IANA zone, so the IANA string is sufficient.
- The persisted-state location (a column on the Agent Instance row vs. a small profile
  store) is an implementation detail of the owning slice.

## Related

- ADR-0003 (WebSocket protocol contract — where `connect` lives)
- ADR-0004 (parse-at-boundary decode for WS + HTTP)
- ADR-0024 (poll-loop scheduler; `next_fire_at` computed with the resolved zone)
- ADR-0026 (cron card carries the optional per-job `tz` override)
- `CONTEXT.md` — User Timezone term
