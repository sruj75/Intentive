# Conventions

House conventions that are **not** already covered by the layer rule, the
architecture lint, or `CONTEXT.md` vocabulary. Read
[`ARCHITECTURE.md`](../ARCHITECTURE.md) and the relevant `CONTEXT.md` first; this
file only fills the gaps an agent would otherwise have to guess.

## Filenames

Enforced by the `intentive-architecture/filename-case` ESLint rule
(`tools/linters/eslint-plugin-intentive-architecture/lib/rules/filename-case.js`).

- **Desktop React components** (`apps/desktop/**/*.tsx`) → **PascalCase**:
  `Onboarding.tsx`, `IntentiveAuthProvider.tsx`. (React component norm.)
- **Everything else** (mobile, services, packages, and desktop non-`.tsx` files)
  → **kebab-case**: `companion-chat.tsx`, `auth-failure.ts`, `resolve-launch-state.ts`,
  `parse.ts`. Single-word lowercase names are valid kebab-case.
- **Exempt** from the rule: `index.*` and `main.*` entrypoints, `*.d.ts`, and
  `*.test.*` / `*.spec.*` files.

A new file in the wrong case fails `pnpm lint`; the error states the expected case.

## Parse at the boundary

Inbound payloads are decoded through their schema at the **runtime boundary**
(the WebSocket message handler or HTTP request handler) and never passed raw into
`service`/`repo` layers. The decode lives once in `@intentive/boundary`
(`parseBoundary` / `BoundaryParseError`); the contract packages surface it — don't
call `.parse()`/`.safeParse()` on the raw schemas at call sites. See
[`docs/adr/0004-shared-boundary-decode-package.md`](adr/0004-shared-boundary-decode-package.md).

- **WebSocket events** (`@intentive/protocol`):
  - `parseClientToRuntimeEvent(raw)` / `safeParseClientToRuntimeEvent(raw)`
  - `parseRuntimeToClientEvent(raw)` / `safeParseRuntimeToClientEvent(raw)`
- **Control Plane HTTP bodies** (`@intentive/api-contract`):
  - `parseBoundary(schema, raw)` — returns the typed value or throws
    `BoundaryParseError`.

**Fail-fast, surface keys not values.** On invalid input, surface only the
offending key paths — never the payload values (which may carry secrets). This
mirrors the config-validation pattern in
`services/control-plane/src/config/env.ts`. `BoundaryParseError.keys` already
follows this rule.

## See also

- Layer direction, deployable topology, the five inviolable rules →
  [`ARCHITECTURE.md`](../ARCHITECTURE.md)
- Domain vocabulary and `_Avoid_` lists → each context's `CONTEXT.md`
  (start at [`../CONTEXT-MAP.md`](../CONTEXT-MAP.md))
- Verification commands and test ownership → [`TESTING.md`](TESTING.md)
