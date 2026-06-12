# Mobile never authors the opening; first-opening idempotency is a store consequence

Status: accepted

The Companion's first message (the opening) is authored by the **Agent Runtime**
when the **Conversation Start Trigger** fires inside Session Start (Control Plane
→ Agent Runtime, during `GET /agent`). The **Mobile Client** never writes a
hardcoded welcome and never selects a separate onboarding chat mode.

Because of that, "no duplicate openings" needs **no bespoke client machinery**. It
is a free consequence of two facts already true:

1. Session Start is **idempotent per User** — retrying `GET /agent` (e.g. after a
   retryable `503`) re-triggers nothing; the same single opening stands.
2. The **Message Store** dedupes by `message_id` — even if a duplicate opening
   reached the client, the two copies share an id and collapse into one. The UI
   cannot render two.

The client's entire obligation is therefore two rules: **never author an opening**,
and **dedupe everything by `message_id`**. We deliberately build **no**
first-opening tracking flag, no "have I triggered the opening yet?" guard. A
future engineer who adds one is re-solving a problem the store already solves and
should delete it.

The **Runtime Adapter** owns the consumer half of the Routing contract: `503` →
retry `GET /agent` with capped backoff, `401` → re-authenticate, `403` → re-check
`GET /me` for the next Pre-Chat Gate before retrying.

## Consequences

- The #33 acceptance criterion "idempotent first-opening retry" is satisfied by
  store dedupe + server idempotency, not by dedicated code.
- Presentation of the protected opening and its failure/recovery copy remains
  #45's; #33 only guarantees at most one opening enters the store.
