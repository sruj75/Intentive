# ADR 0026: Cron Is a DeepAgents-Native Filesystem Card — No Bespoke Cron Tools

## Status

Accepted

## Date

2026-06-15

## Context

Issue #39's Cron needs an agent-facing surface: how does the Companion create, list,
edit, and cancel its own scheduled jobs? The face-value answer — inherited from
OpenClaw's `cron add|list|edit|remove` CLI — is a set of bespoke tools
(`schedule_cron`, `list_crons`, `edit_cron`, `cancel_cron`). An earlier draft of
`CONTEXT.md` even named a `schedule_cron` tool as part of the v1 surface.

Running the requirement through first principles breaks that assumption:

- **OpenClaw's CLI exists for a human operator at a terminal.** Our consumer is an LLM
  that **already has a filesystem.** DeepAgents ships built-in `ls` / `read_file` /
  `write_file` / `edit_file` / `glob` / `grep` over its backend. The CRUD verbs we were
  about to build map one-for-one onto tools the agent already has.
- **We already proved this pattern for memory.** Per-user memory is not a set of memory
  tools — the agent writes `USER.md` / `/memories/*` with the same built-in filesystem
  tools, over the Neon `StoreBackend` (ADR-0012, ADR-0021). Cron is the same shape:
  the user's recorded instruction was to "apply the same mental model — adapt
  OpenClaw's battle-tested pattern, but build it the DeepAgents way."
- **The tutorial's `CRON.md` was right after all.** build-your-own-openclaw stores each
  job as a `CRON.md` file (frontmatter + prompt body). An earlier note rejected files in
  favor of a Neon table for cross-user querying — but that was a false dichotomy: our
  VFS _is_ Postgres. A cron card is a **file to the agent and a row to the shell** at the
  same time.

## Decision

**A cron job is a markdown "cron card" the agent authors with DeepAgents' built-in
filesystem tools under a reserved `/crons/` route on the Neon `StoreBackend`. There are
no bespoke cron CRUD tools. Self-scheduling is file I/O, exactly like memory.**

1. **CRUD = filesystem verbs the agent already has.**
   - create → `write_file("/crons/<id>.md", …)`
   - list → `ls /crons/`
   - get → `read_file`
   - edit → `edit_file`
   - cancel → `edit_file` setting `status: cancelled` (the poll loop ignores
     non-active cards; no `rm` primitive is needed, and one-shots auto-delete shell-side
     after firing).

2. **The card carries the OpenClaw card fields.** Frontmatter: `name`, `schedule`
   (`at`/`every`/`cron`), optional `tz` (ADR-0025), `session` (`main` in v1, ADR-0017),
   `status`, and the shell-computed `next_fire_at`. The body is the **prompt** — the
   "why I woke you" intent dispatched into the turn on fire.

3. **The write-route owns validation and `next_fire_at`.** Writes under `/crons/` pass
   through a shell-side route that parses the schedule with **croner**, enforces the
   **5-minute minimum-interval floor**, rejects invalid cards with an error surfaced back
   through the `write_file` result, and computes/persists `next_fire_at` onto the card.
   The agent authors intent; the shell owns correctness and scheduling math.

4. **One file surface, two reserved routes, one backend.** `USER.md` / `/memories/` for
   memory and `/crons/` for scheduling are both routes on the same Neon `StoreBackend`,
   `user_id`-scoped. The poll loop (ADR-0024) queries due cards across all users directly
   over that backend — the cross-user query that once argued for a separate table is one
   indexed scan here, because the backend is Postgres.

5. **Post-Message-Back stays a real tool; scheduling does not.** Egress reaches a human
   and has external blast radius, so it must be an explicit, auditable tool call
   (ADR-0013). Writing a cron card has no external side effect at write time (it only
   fires later, silently, recording a run), so it does not warrant a bespoke tool.

## Considered Options

- **A `schedule_cron` (+ list/edit/cancel) bespoke tool set.** Rejected: re-implements
  filesystem verbs the agent already has, bloats the tool manifest (more for the model to
  misuse, costlier turns), and diverges from the memory pattern we already shipped.
- **Single `manage_cron({action, …})` tool.** Rejected for the same reason plus a worse
  schema: one overloaded action-switch is less self-documenting to the model than the
  built-in file verbs, and still duplicates the filesystem.
- **On-disk `CRON.md` files (the tutorial's literal storage).** Rejected as the _storage_
  (no shared disk in a multi-tenant process; no cross-user query) — but adopted as the
  _card shape_, persisted via the Neon `StoreBackend` instead of the local filesystem.

## Consequences

### Positive

- Zero new tools: smaller manifest, cheaper/faster turns, less misuse surface.
- One fewer storage family and no projection layer — the card is the row.
- Reuses memory's proven `StoreBackend` + VFS-route machinery; cron is "just file I/O."
- Dissolves the file-vs-DB debate: file to the agent, row to the shell.

### Negative

- Validation error messaging lives in a write-route's `write_file` rejection rather than a
  purpose-built tool's typed errors — slightly less ergonomic feedback to the model.
- The model must author valid frontmatter rather than fill a structured tool schema;
  mitigated because it already authors structured memory files successfully.

### Neutral / Follow-up

- **Escape hatch:** if evals show the model fumbles cron-card frontmatter, add a single
  thin convenience tool later — explicitly _not_ built up front.
- Operator/debug verbs (`run` now, browse `runs` history) are **not** on the agent
  surface in v1; they are operator concerns, added when a use case appears.
- The `/crons/` route's exact frontmatter schema and the run-record (`cron_runs`)
  representation are implementation details of the cron slice.

## Related

- ADR-0012 (native DeepAgents memory model — the precedent: files over `StoreBackend`)
- ADR-0013 (egress via explicit tools; why Post-Message-Back stays a tool)
- ADR-0017 (v1 cron runs in the main session; `session: main` card field)
- ADR-0019 (v1 minimal tool surface — no skills/subagents)
- ADR-0021 (native VFS + per-user store memory)
- ADR-0024 (poll-loop scheduler that reads due cards)
- ADR-0025 (device-reported timezone; the card's `tz` field)
- `CONTEXT.md` — Cron term; v1 tool surface
