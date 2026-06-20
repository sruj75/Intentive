# @intentive/eslint-plugin-architecture

Mechanical enforcement of Intentive's layered domain architecture. The rules in this plugin are the cash value of [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) — without them, the architecture is a wish, not a constraint.

## Rules

### `layer-direction`

Inside any business domain (`apps/<x>/src/domains/<domain>/` or `services/<x>/src/domains/<domain>/`), code may only import from the **same or lower** layers in this order:

```
types  →  config  →  repo  →  service  →  runtime  →  ui
```

`providers/` is cross-cutting and may be imported from any layer.

**Reports:**

- Backward imports (e.g. `service/foo.ts` importing from `runtime/bar.ts`).
- Cross-domain imports (one domain reaching into another domain's internals).

### `no-cross-deployable`

Forbids one deployable from importing another deployable's source via relative paths. Shared code goes in `packages/*` and is imported by workspace name (e.g. `@intentive/protocol`), never by path.

### `provider-only-cross-cutting`

Forbids deployable/domain code from importing cross-cutting SDKs directly. Auth, telemetry, observability, feature flags, and other cross-cutting clients must enter through `@intentive/providers/*` or a deployable-local `providers/` seam.

The first enforced SDKs are Sentry (`@sentry/node`) and Langfuse tracing (`langfuse-langchain`). Their initialization lives in `packages/providers/src/observability/`; the rule keeps a narrow Agent Runtime `Langfuse` prompt-floor client exception while blocking tracing handler setup outside Providers.

## Why mechanical?

From [OpenAI's Harness Engineering post](https://openai.com/index/harness-engineering/):

> Documentation alone doesn't keep a fully agent-generated codebase coherent. By enforcing invariants, not micromanaging implementations, we let agents ship fast without undermining the foundation.

A layer rule that lives only in a doc decays in weeks. The same rule expressed as a lint check survives indefinitely — every PR is mechanically checked, every editor lights up violations live, and the error message tells the agent exactly how to fix it.

## Testing the plugin itself

```bash
node tools/linters/eslint-plugin-intentive-architecture/test.js
```

Pure Node, no dependencies. Tests the path parser, rule logic, and ESLint integration fixtures in isolation. Should print `0 failed`.

## Using the plugin in the workspace

The plugin is wired up at the monorepo root in [`eslint.config.cjs`](../../../eslint.config.cjs). After `pnpm install`:

```bash
pnpm lint              # runs ESLint across the whole workspace
pnpm lint --fix        # auto-fix what's mechanical (very little for these rules)
```

## Extending

When CONTEXT.md grows a new architectural invariant that's mechanically checkable, add a new rule under `lib/rules/`, export it from `index.js`, and add it to the `recommended` config. Always add a test in `test.js` first.
