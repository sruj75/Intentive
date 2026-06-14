/**
 * Runtime-domain SQL port. It mirrors the Neon tagged-template shape while
 * keeping repo/service modules free of a concrete driver import.
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
