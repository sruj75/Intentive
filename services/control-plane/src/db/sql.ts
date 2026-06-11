/**
 * The narrow SQL capability the repos need: a tagged-template query returning
 * rows. The Neon driver (`@neondatabase/serverless`'s `neon()`) satisfies this;
 * depending on this local port instead of the driver keeps the driver out of the
 * repos' imports (and out of unit-tier module graphs).
 *
 * Lives in a service-local `src/db/` directory — outside `domains/`, so (like
 * `src/main.ts`) it is exempt from the forward-only layer rule and the
 * cross-domain import ban. Every domain's `repo` tier imports the one definition
 * from here rather than restating it.
 */
export interface Sql {
  <Row = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Row[]>;
}
