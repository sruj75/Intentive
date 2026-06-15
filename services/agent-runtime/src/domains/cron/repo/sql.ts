/**
 * The narrow SQL capability cron repos need: a tagged-template query returning
 * rows. The Neon driver satisfies this port, but cron modules do not import the
 * driver or another domain's repo types directly.
 */
export interface Sql {
  <Row = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Row[]>;
}

export type SqlQuery<Row = unknown> = Promise<Row[]>;

export interface TransactionalSql extends Sql {
  transaction(queries: SqlQuery[]): Promise<unknown[]>;
}
