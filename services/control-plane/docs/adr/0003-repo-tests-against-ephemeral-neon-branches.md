# Control Plane repo-layer tests run against ephemeral Neon branches; #50 owns production provisioning

Status: accepted

Control Plane feature tickets (starting with #23 `identity`) test their `repo` layer two ways: `service`-layer logic against in-memory repo/provider fakes, and the `repo` layer itself against a **real, disposable Neon branch** created and dropped per test run. The branch runs the ticket's own migration (e.g. `migrations/0001_users.sql`) and exercises the real SQL — including invariants only a real database enforces, such as "the same User signing in twice produces exactly one `control_plane.users` row" (a unique constraint, not application logic). The branch is throwaway test infrastructure; it never touches production. Production schema/role provisioning and applying migrations to the live system remain #50's exclusive responsibility (see `migrations/README.md`).

**Considered Options**

- **Both layers — fakes for logic, ephemeral Neon branch for the repo (chosen).** The point of the `repo` layer is its SQL; a fake repo tests the fake, not the database. Real-branch tests catch migration and query bugs at the ticket that wrote them instead of at deploy time (#50), and prove constraint-enforced idempotency for real. Neon branching makes the test database cheap and disposable, and the test path is reused by every later CP ticket (#26, #27, #30).
- **Fakes only.** Fast and hermetic, but leaves the most bug-prone surface — the actual SQL and migration — unexercised until #50 switches on production. SQL/migration bugs then surface far from the code that caused them.
- **Real database only.** Highest fidelity but heaviest and flakiest: every test needs a live connection, with no fast hermetic logic tier.

**Consequences**

- CI needs credentials/permission to create and drop Neon branches for test runs. This plumbing is built once in #23 and reused across the CP lane.
- The #50 provisioning boundary stays intact: #23's database is only ever an ephemeral test branch. #23 writes `0001_users.sql`; #50 applies it to the real `control_plane` schema with the `control_plane_app` role.
- `repo` integration tests own the database-enforced invariants (uniqueness, idempotency); `service` tests own branching logic with fakes. New CP domains follow the same split.
