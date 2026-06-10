/**
 * The narrow SQL capability the conversation repo needs: a tagged-template query
 * returning rows. The Neon driver satisfies this port, but repo modules do not
 * import the driver directly. Each domain owns its own port (the boundary lint
 * forbids importing another domain's `repo`), and the same concrete driver
 * satisfies all of them structurally.
 */
export interface Sql {
  <Row = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Row[]>;
}

export type SqlQuery<Row = unknown> = Promise<Row[]>;
